// ---------------------------------------------------------------------------
// Claude Code headless client — DEV / TEST ONLY
// ---------------------------------------------------------------------------
// A drop-in {@link AnthropicClient} that routes `messages.create` through the
// locally-installed Claude Code CLI (`claude -p`) instead of the metered
// Anthropic API. It draws on the operator's Claude Code subscription, so it
// consumes NO API credits.
//
// Intended strictly for manual test/dev pipeline runs. It is guarded so it can
// never be constructed on the production/cron path (see {@link assertDevOnly}),
// and it is never wired into the scheduler.
//
// Trade-offs vs the real SDK client:
//   - No native tool_use. Structured output is emulated by instructing the CLI
//     to emit a single JSON object matching the tool's input_schema, then
//     parsing it back into a synthetic `tool_use` content block.
//   - The API MODEL_MAP routing is ignored: the CLI uses whatever model the
//     Claude Code session is configured for (overridable via CLAUDE_CODE_MODEL).
//   - Latency and rate limits follow the subscription, not the API.
//
// ToS note: a consumer Claude subscription is for interactive use. This client
// exists for local/dev experimentation only — do not point it at an automated
// commercial send path.
// ---------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import type Anthropic from '@anthropic-ai/sdk';
import type { AnthropicClient } from './types';

/** Env flag that must equal '1' to allow the dev client to run. */
export const DEV_CLIENT_ENV_FLAG = 'CLAUDE_CODE_DEV_CLIENT';
/** Optional env var to force a specific CLI model (e.g. `claude-opus-4-8`). */
export const DEV_CLIENT_MODEL_ENV = 'CLAUDE_CODE_MODEL';

/** Default wall-clock budget for a single CLI invocation. */
const DEFAULT_TIMEOUT_MS = 180_000;
/** Hard cap on captured stdout/stderr, so a runaway CLI can't exhaust memory. */
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

export interface ClaudeCodeClientOptions {
  /** CLI binary name/path. Defaults to `claude` (resolved on PATH). */
  readonly binary?: string;
  /** Per-call timeout in milliseconds. Defaults to 180s. */
  readonly timeoutMs?: number;
  /**
   * Bypass the environment guard. Only tests set this — production code must
   * opt in via the {@link DEV_CLIENT_ENV_FLAG} env var instead.
   */
  readonly force?: boolean;
  /**
   * Injectable process runner (tests stub this). Receives the prompt on stdin
   * and must resolve the CLI's raw stdout string.
   */
  readonly runner?: (prompt: string) => Promise<string>;
}

/**
 * Refuse to run outside an explicit dev/test opt-in. Guards against the client
 * ever being constructed on the production or scheduler path.
 */
export function assertDevOnly(force = false): void {
  // The production hard-block is UNCONDITIONAL — `force` must never defeat it,
  // or the "never runs in production" guarantee would be bypassable via the
  // public ClaudeCodeClientOptions API. `force` only skips the opt-in flag
  // (tests construct the client without setting the env var).
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(
      'Claude Code dev client is disabled in production. It is a test/dev-only ' +
        'backend and must never run on the cron/send path.',
    );
  }
  if (force) return;
  if (process.env[DEV_CLIENT_ENV_FLAG] !== '1') {
    throw new Error(
      `Claude Code dev client is opt-in. Set ${DEV_CLIENT_ENV_FLAG}=1 to enable it ` +
        'for a manual dev pipeline run.',
    );
  }
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

/**
 * Build the single-shot prompt handed to the CLI. Because the CLI has no native
 * tool_use, we describe the tool + its JSON schema and demand a bare JSON object
 * as the entire response.
 */
export function buildToolPrompt(params: {
  system: string;
  userMessage: string;
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown>;
}): string {
  const { system, userMessage, toolName, toolDescription, inputSchema } = params;
  return [
    system,
    '',
    '---',
    `You must respond by calling the tool "${toolName}": ${toolDescription}`,
    'Return ONLY a single JSON object that conforms to this JSON Schema for the',
    'tool input. Do not include any prose, explanation, or Markdown code fences —',
    'the very first character of your reply must be "{" and the last must be "}".',
    '',
    'JSON Schema:',
    JSON.stringify(inputSchema),
    '',
    '---',
    userMessage,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

interface ClaudeCliEnvelope {
  readonly type?: string;
  readonly subtype?: string;
  readonly is_error?: boolean;
  readonly result?: string;
  readonly usage?: { input_tokens?: number; output_tokens?: number };
}

/** Strip an optional ```json … ``` fence some models add despite instructions. */
export function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return (fence?.[1] ?? trimmed).trim();
}

/**
 * Parse the CLI's `--output-format json` envelope and extract the model's JSON
 * tool input. Throws on CLI error, empty result, or unparseable JSON.
 */
export function parseCliOutput(stdout: string): {
  input: unknown;
  usage: { input_tokens: number; output_tokens: number };
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(
      `Claude Code CLI did not return valid JSON envelope: ${stdout.slice(0, 500)}`,
    );
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`Claude Code CLI envelope was not an object: ${stdout.slice(0, 500)}`);
  }
  const envelope = parsed as ClaudeCliEnvelope;

  if (envelope.is_error || envelope.subtype !== 'success') {
    throw new Error(
      `Claude Code CLI reported an error (subtype=${String(envelope.subtype)}): ${
        typeof envelope.result === 'string' ? envelope.result : '<no result>'
      }`,
    );
  }

  const resultText = typeof envelope.result === 'string' ? envelope.result.trim() : '';
  if (!resultText) {
    throw new Error('Claude Code CLI returned an empty result.');
  }

  let input: unknown;
  try {
    input = JSON.parse(stripJsonFence(resultText));
  } catch {
    throw new Error(
      `Claude Code CLI result was not JSON tool input: ${resultText.slice(0, 500)}`,
    );
  }

  return {
    input,
    usage: {
      input_tokens: envelope.usage?.input_tokens ?? 0,
      output_tokens: envelope.usage?.output_tokens ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Process runner (spawn, no shell, prompt via stdin)
// ---------------------------------------------------------------------------

function defaultRunner(binary: string, timeoutMs: number) {
  return (prompt: string): Promise<string> =>
    new Promise((resolve, reject) => {
      // Args are a fixed allow-list; the untrusted prompt (which contains
      // scraped article titles/excerpts) is written to stdin, never argv, and
      // `shell` is false — so no article content can be interpreted as a flag
      // or shell metacharacter.
      const args = ['-p', '--output-format', 'json'];
      const model = process.env[DEV_CLIENT_MODEL_ENV];
      if (model) args.push('--model', model);

      // Run from a neutral cwd so the repo's CLAUDE.md / project hooks are not
      // auto-discovered into a single-shot JSON extraction (they could alter the
      // output or hang until the timeout). NB: we deliberately do NOT pass
      // `--bare` — it also skips keychain reads, which is where the Claude Code
      // subscription auth lives, so `--bare` would fail with "Not logged in".
      const child = spawn(binary, args, { shell: false, cwd: tmpdir() });

      let stdout = '';
      let stderr = '';
      let settled = false;
      const timer = setTimeout(() => {
        finish(() => reject(new Error(`Claude Code CLI timed out after ${timeoutMs}ms`)));
      }, timeoutMs);

      // Single settle path: clears the timer, kills the child if still running,
      // and ignores any later events.
      function finish(action: () => void): void {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (child.exitCode === null) child.kill('SIGKILL');
        action();
      }

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
        if (stdout.length > MAX_BUFFER_BYTES) {
          finish(() => reject(new Error('Claude Code CLI stdout exceeded buffer limit')));
        }
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
        if (stderr.length > MAX_BUFFER_BYTES) {
          finish(() => reject(new Error('Claude Code CLI stderr exceeded buffer limit')));
        }
      });
      child.on('error', (error: NodeJS.ErrnoException) => {
        finish(() => {
          if (error.code === 'ENOENT') {
            reject(
              new Error(
                `Claude Code CLI '${binary}' not found on PATH. Install Claude Code to use the dev client.`,
              ),
            );
            return;
          }
          reject(error);
        });
      });
      child.on('close', (code: number | null) => {
        finish(() => {
          if (code !== 0) {
            reject(new Error(`Claude Code CLI exited with code ${code}: ${stderr.slice(0, 500)}`));
            return;
          }
          resolve(stdout);
        });
      });

      // A post-spawn stdin failure (e.g. EPIPE if the child exits early) does not
      // fire the child's 'error' event — reject immediately instead of waiting
      // for the timeout.
      child.stdin.on('error', (error: Error) => {
        finish(() => reject(error));
      });
      child.stdin.write(prompt);
      child.stdin.end();
    });
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let toolUseCounter = 0;

/**
 * Create a dev/test {@link AnthropicClient} backed by the Claude Code CLI.
 *
 * Guarded by {@link assertDevOnly}: throws unless `CLAUDE_CODE_DEV_CLIENT=1`
 * (and never in production) or `opts.force` is set (tests only).
 */
export function createClaudeCodeClient(opts: ClaudeCodeClientOptions = {}): AnthropicClient {
  assertDevOnly(opts.force);

  const binary = opts.binary ?? 'claude';
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const runner = opts.runner ?? defaultRunner(binary, timeoutMs);

  const create = async (
    body: Anthropic.MessageCreateParamsNonStreaming,
  ): Promise<Anthropic.Message> => {
    // The pipeline always passes a single CUSTOM tool (name/description/input_schema).
    // Guard the tool kind: the SDK `tools` union also allows bash/text-editor/etc.
    // variants with different shapes — reject those with a clear error rather than
    // silently building a malformed prompt from an undefined input_schema.
    const firstTool = body.tools?.[0];
    if (!firstTool || !('input_schema' in firstTool)) {
      throw new Error('Claude Code dev client requires a custom tool definition (tool-use only).');
    }
    const tool = firstTool as Anthropic.Tool;

    // The system prompt arrives as a cache-control block array; flatten to text.
    const systemText = Array.isArray(body.system)
      ? body.system.map((b) => ('text' in b ? b.text : '')).join('\n')
      : (body.system ?? '');

    const userMessage = body.messages
      .map((m) => (typeof m.content === 'string' ? m.content : ''))
      .join('\n');

    const prompt = buildToolPrompt({
      system: systemText,
      userMessage,
      toolName: tool.name,
      toolDescription: tool.description ?? '',
      inputSchema: (tool.input_schema ?? {}) as Record<string, unknown>,
    });

    const stdout = await runner(prompt);
    const { input, usage } = parseCliOutput(stdout);

    toolUseCounter += 1;
    const message = {
      id: `msg_claudecode_${toolUseCounter}`,
      type: 'message',
      role: 'assistant',
      model: process.env[DEV_CLIENT_MODEL_ENV] ?? 'claude-code-cli',
      stop_reason: 'tool_use',
      stop_sequence: null,
      content: [
        {
          type: 'tool_use',
          id: `toolu_claudecode_${toolUseCounter}`,
          name: tool.name,
          input,
        },
      ],
      usage: {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
      },
    };

    // The synthetic message intentionally omits fields the pipeline never reads
    // (e.g. cache token counts); cast to the SDK type at the boundary.
    return message as unknown as Anthropic.Message;
  };

  return {
    messages: {
      // Only the non-streaming tool-use overload is exercised by the pipeline.
      create: create as unknown as AnthropicClient['messages']['create'],
    } as unknown as AnthropicClient['messages'],
  };
}
