import { EventEmitter } from 'node:events';
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { spawn } from 'node:child_process';
import {
  assertDevOnly,
  buildToolPrompt,
  parseCliOutput,
  stripJsonFence,
  createClaudeCodeClient,
  DEV_CLIENT_ENV_FLAG,
  DEV_CLIENT_MODEL_ENV,
} from '../pipeline/claude-code-client';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
const spawnMock = spawn as unknown as Mock;

// ---------------------------------------------------------------------------
// Guard: assertDevOnly
// ---------------------------------------------------------------------------

describe('assertDevOnly', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it('throws in production regardless of the opt-in flag', () => {
    process.env['NODE_ENV'] = 'production';
    process.env[DEV_CLIENT_ENV_FLAG] = '1';
    expect(() => assertDevOnly()).toThrow(/disabled in production/i);
  });

  it('throws when the opt-in flag is not set', () => {
    process.env['NODE_ENV'] = 'development';
    delete process.env[DEV_CLIENT_ENV_FLAG];
    expect(() => assertDevOnly()).toThrow(/opt-in/i);
  });

  it('passes when the opt-in flag is set outside production', () => {
    process.env['NODE_ENV'] = 'development';
    process.env[DEV_CLIENT_ENV_FLAG] = '1';
    expect(() => assertDevOnly()).not.toThrow();
  });

  it('force bypasses only the opt-in flag, never the production hard-block', () => {
    // Production is unconditional — force must NOT defeat it.
    process.env['NODE_ENV'] = 'production';
    expect(() => assertDevOnly(true)).toThrow(/disabled in production/i);
    // Outside production, force skips the opt-in flag requirement.
    process.env['NODE_ENV'] = 'development';
    delete process.env[DEV_CLIENT_ENV_FLAG];
    expect(() => assertDevOnly(true)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

describe('buildToolPrompt', () => {
  it('embeds the system prompt, schema, tool name and user message', () => {
    const prompt = buildToolPrompt({
      system: 'You are a ranker.',
      userMessage: 'Rank these: A, B, C',
      toolName: 'submit_ranking',
      toolDescription: 'Return the ranking',
      inputSchema: { type: 'object', properties: { order: { type: 'array' } } },
    });
    expect(prompt).toContain('You are a ranker.');
    expect(prompt).toContain('submit_ranking');
    expect(prompt).toContain('Return the ranking');
    expect(prompt).toContain('Rank these: A, B, C');
    expect(prompt).toContain('"order"');
    // Must demand a bare JSON object (no fences/prose).
    expect(prompt).toMatch(/first character of your reply must be "\{"/i);
  });
});

// ---------------------------------------------------------------------------
// Fence stripping
// ---------------------------------------------------------------------------

describe('stripJsonFence', () => {
  it('returns bare JSON untouched', () => {
    expect(stripJsonFence('{"a":1}')).toBe('{"a":1}');
  });
  it('strips a ```json fence', () => {
    expect(stripJsonFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it('strips a bare ``` fence', () => {
    expect(stripJsonFence('```\n{"a":1}\n```')).toBe('{"a":1}');
  });
});

// ---------------------------------------------------------------------------
// Envelope parsing
// ---------------------------------------------------------------------------

describe('parseCliOutput', () => {
  const envelope = (over: Record<string, unknown>) =>
    JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: '{"ok":true}',
      usage: { input_tokens: 10, output_tokens: 5 },
      ...over,
    });

  it('extracts JSON tool input and usage from a success envelope', () => {
    const { input, usage } = parseCliOutput(envelope({}));
    expect(input).toEqual({ ok: true });
    expect(usage).toEqual({ input_tokens: 10, output_tokens: 5 });
  });

  it('parses a fenced result', () => {
    const { input } = parseCliOutput(envelope({ result: '```json\n{"ok":true}\n```' }));
    expect(input).toEqual({ ok: true });
  });

  it('defaults usage to zero when absent', () => {
    const { usage } = parseCliOutput(envelope({ usage: undefined }));
    expect(usage).toEqual({ input_tokens: 0, output_tokens: 0 });
  });

  it('throws when the CLI reports an error', () => {
    expect(() => parseCliOutput(envelope({ is_error: true, subtype: 'error_max_turns' }))).toThrow(
      /reported an error/i,
    );
  });

  it('throws on a non-JSON envelope', () => {
    expect(() => parseCliOutput('not json at all')).toThrow(/valid JSON envelope/i);
  });

  it('throws when the envelope JSON is not an object', () => {
    expect(() => parseCliOutput('"just a string"')).toThrow(/not an object/i);
  });

  it('throws when the result is not a string (shape drift)', () => {
    expect(() => parseCliOutput(envelope({ result: { nested: true } }))).toThrow(/empty result/i);
  });

  it('throws when the result is not JSON', () => {
    expect(() => parseCliOutput(envelope({ result: 'sorry, I cannot' }))).toThrow(
      /not JSON tool input/i,
    );
  });

  it('throws on an empty result', () => {
    expect(() => parseCliOutput(envelope({ result: '   ' }))).toThrow(/empty result/i);
  });
});

// ---------------------------------------------------------------------------
// Client factory — tool_use emulation with an injected runner
// ---------------------------------------------------------------------------

describe('createClaudeCodeClient (injected runner)', () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env['NODE_ENV'] = 'test';
    process.env[DEV_CLIENT_ENV_FLAG] = '1';
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it('returns a synthetic tool_use message the pipeline can read', async () => {
    const runner = vi.fn().mockResolvedValue(
      JSON.stringify({
        subtype: 'success',
        is_error: false,
        result: '{"selection":["x"]}',
        usage: { input_tokens: 42, output_tokens: 7 },
      }),
    );
    const client = createClaudeCodeClient({ runner });

    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      system: [{ type: 'text', text: 'sys' }],
      messages: [{ role: 'user', content: 'do it' }],
      tools: [{ name: 'submit', description: 'd', input_schema: { type: 'object' } }],
      tool_choice: { type: 'tool', name: 'submit' },
    } as never);

    const block = (response.content as Array<{ type: string; input?: unknown; name?: string }>)[0]!;
    expect(block.type).toBe('tool_use');
    expect(block.name).toBe('submit');
    expect(block.input).toEqual({ selection: ['x'] });
    expect(response.usage.input_tokens).toBe(42);
    expect(response.usage.output_tokens).toBe(7);
  });

  it('passes the built prompt to the runner', async () => {
    const runner = vi.fn().mockResolvedValue(
      JSON.stringify({ subtype: 'success', result: '{"a":1}', usage: {} }),
    );
    const client = createClaudeCodeClient({ runner });
    await client.messages.create({
      system: 'ranker-system',
      messages: [{ role: 'user', content: 'user-body' }],
      tools: [{ name: 'the_tool', description: '', input_schema: { type: 'object' } }],
    } as never);

    expect(runner).toHaveBeenCalledOnce();
    const prompt = runner.mock.calls[0]![0] as string;
    expect(prompt).toContain('ranker-system');
    expect(prompt).toContain('user-body');
    expect(prompt).toContain('the_tool');
  });

  it('rejects a request with no tool definition', async () => {
    const runner = vi.fn();
    const client = createClaudeCodeClient({ runner });
    await expect(
      client.messages.create({ messages: [{ role: 'user', content: 'x' }] } as never),
    ).rejects.toThrow(/custom tool definition/i);
    expect(runner).not.toHaveBeenCalled();
  });

  it('rejects a non-custom tool kind (e.g. bash tool)', async () => {
    const runner = vi.fn();
    const client = createClaudeCodeClient({ runner });
    await expect(
      client.messages.create({
        messages: [{ role: 'user', content: 'x' }],
        tools: [{ type: 'bash_20250124', name: 'bash' }],
      } as never),
    ).rejects.toThrow(/custom tool definition/i);
    expect(runner).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Default runner — real spawn path (child_process mocked)
// ---------------------------------------------------------------------------

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: { write: Mock; end: Mock; on: Mock };
  kill: Mock;
  exitCode: number | null;
}

function makeFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write: vi.fn(), end: vi.fn(), on: vi.fn() };
  child.kill = vi.fn(() => {
    child.exitCode = 137;
    return true;
  });
  child.exitCode = null;
  return child;
}

describe('createClaudeCodeClient (default spawn runner)', () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env['NODE_ENV'] = 'test';
    process.env[DEV_CLIENT_ENV_FLAG] = '1';
    spawnMock.mockReset();
  });
  afterEach(() => {
    process.env = { ...original };
    vi.useRealTimers();
  });

  const request = {
    system: 'sys',
    messages: [{ role: 'user', content: 'body' }],
    tools: [{ name: 't', description: 'd', input_schema: { type: 'object' } }],
  } as never;

  it('spawns with a fixed argv allow-list, no shell, neutral cwd, prompt via stdin', async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);
    const client = createClaudeCodeClient();

    const p = client.messages.create(request);
    child.stdout.emit(
      'data',
      Buffer.from(JSON.stringify({ subtype: 'success', result: '{"a":1}', usage: {} })),
    );
    child.emit('close', 0);
    await p;

    const [bin, args, opts] = spawnMock.mock.calls[0]!;
    expect(bin).toBe('claude');
    expect(args).toEqual(['-p', '--output-format', 'json']);
    // No shell (no injection) and a neutral cwd (no CLAUDE.md/hook auto-discovery).
    expect((opts as { shell: boolean }).shell).toBe(false);
    expect(typeof (opts as { cwd: string }).cwd).toBe('string');
    // `--bare` must NOT be passed — it skips keychain auth reads.
    expect((args as string[]).includes('--bare')).toBe(false);
    // Untrusted prompt goes to stdin, never argv.
    expect(child.stdin.write).toHaveBeenCalledOnce();
    expect(child.stdin.end).toHaveBeenCalledOnce();
    expect((args as string[]).some((a) => a.includes('body'))).toBe(false);
  });

  it('appends --model when CLAUDE_CODE_MODEL is set', async () => {
    process.env[DEV_CLIENT_MODEL_ENV] = 'claude-opus-4-8';
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);
    const client = createClaudeCodeClient();

    const p = client.messages.create(request);
    child.stdout.emit(
      'data',
      Buffer.from(JSON.stringify({ subtype: 'success', result: '{"a":1}', usage: {} })),
    );
    child.emit('close', 0);
    await p;

    const args = spawnMock.mock.calls[0]![1] as string[];
    expect(args).toEqual(['-p', '--output-format', 'json', '--model', 'claude-opus-4-8']);
  });

  it('rejects with a friendly message when the CLI is not found (ENOENT)', async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);
    const client = createClaudeCodeClient();

    const p = client.messages.create(request);
    const err = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });
    child.emit('error', err);
    await expect(p).rejects.toThrow(/not found on PATH/i);
  });

  it('rejects with stderr on a non-zero exit', async () => {
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);
    const client = createClaudeCodeClient();

    const p = client.messages.create(request);
    child.stderr.emit('data', Buffer.from('boom detail'));
    child.emit('close', 1);
    await expect(p).rejects.toThrow(/exited with code 1: boom detail/i);
  });

  it('kills the child and rejects on timeout', async () => {
    vi.useFakeTimers();
    const child = makeFakeChild();
    spawnMock.mockReturnValue(child);
    const client = createClaudeCodeClient({ timeoutMs: 1000 });

    const p = client.messages.create(request);
    const assertion = expect(p).rejects.toThrow(/timed out after 1000ms/i);
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });
});
