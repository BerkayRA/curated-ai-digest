// ---------------------------------------------------------------------------
// LLM utility helpers shared across pipeline stages
// ---------------------------------------------------------------------------

import { z } from 'zod';
import type { AnthropicClient } from './types';
import type Anthropic from '@anthropic-ai/sdk';

// ---------------------------------------------------------------------------
// Tool-use structured output
// ---------------------------------------------------------------------------

/** Defines a single tool for the Anthropic tool-use structured-output pattern. */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

export interface CallWithToolOpts {
  readonly client: AnthropicClient;
  readonly model: string;
  readonly system: string;
  readonly userMessage: string;
  readonly tool: ToolDefinition;
  /** Max tokens to request (defaults to 4096). */
  readonly maxTokens?: number;
}

export interface ToolCallResult {
  readonly rawInput: unknown;
  readonly usage: { inputTokens: number; outputTokens: number };
}

/**
 * Calls the Anthropic messages API using tool_use to extract structured JSON.
 * The model is forced to call the named tool via tool_choice.
 *
 * Throws if no tool_use block is returned.
 */
export async function callWithTool(opts: CallWithToolOpts): Promise<ToolCallResult> {
  const { client, model, system, userMessage, tool, maxTokens = 4096 } = opts;

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: [
      {
        type: 'text',
        text: system,
        // Enable prompt caching on the system prompt (long, stable context)
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userMessage }],
    tools: [
      {
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema as Anthropic.Tool['input_schema'],
      },
    ],
    tool_choice: { type: 'tool', name: tool.name },
  });

  const toolBlock = response.content.find((b) => b.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error(`Expected tool_use block from model '${model}' but got none`);
  }

  return {
    rawInput: toolBlock.input,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

// ---------------------------------------------------------------------------
// Validated tool call with retry on Zod parse failure
// ---------------------------------------------------------------------------

export interface ParsedToolCallOpts<T> extends CallWithToolOpts {
  readonly schema: z.ZodType<T>;
  /** Max retry attempts on parse failure (default 2). */
  readonly retries?: number;
}

export interface ParsedToolCallResult<T> {
  readonly data: T;
  readonly usage: { inputTokens: number; outputTokens: number };
}

/**
 * Calls the Anthropic tool-use API and validates the output against a Zod schema.
 * Retries up to `retries` times on parse failure before throwing.
 *
 * Accumulates token usage across retries.
 */
export async function callWithValidatedTool<T>(
  opts: ParsedToolCallOpts<T>,
): Promise<ParsedToolCallResult<T>> {
  const { schema, retries = 2, ...callOpts } = opts;

  let lastError: unknown;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await callWithTool(callOpts);
    totalInputTokens += result.usage.inputTokens;
    totalOutputTokens += result.usage.outputTokens;

    const parsed = schema.safeParse(result.rawInput);
    if (parsed.success) {
      return {
        data: parsed.data,
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      };
    }

    lastError = parsed.error;
  }

  throw new Error(
    `Failed to parse LLM tool output after ${retries + 1} attempts: ${String(lastError)}`,
  );
}
