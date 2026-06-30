import { describe, it, expect, vi } from 'vitest';
import { callWithTool, callWithValidatedTool } from '../pipeline/llm-utils';
import { z } from 'zod';
import type { AnthropicClient } from '../pipeline/types';

// ---------------------------------------------------------------------------
// Mock Anthropic client factory
// ---------------------------------------------------------------------------

function makeToolUseResponse(input: unknown) {
  return {
    content: [
      {
        type: 'tool_use' as const,
        id: 'tu_1',
        name: 'test_tool',
        input,
      },
    ],
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

function makeClientReturning(input: unknown): AnthropicClient {
  return {
    messages: {
      create: vi.fn().mockResolvedValue(makeToolUseResponse(input)),
    },
  } as unknown as AnthropicClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const baseTool = {
  name: 'test_tool',
  description: 'A test tool',
  inputSchema: {
    type: 'object',
    properties: { value: { type: 'string' } },
    required: ['value'],
  },
};

describe('callWithTool', () => {
  it('returns rawInput and usage from tool_use block', async () => {
    const client = makeClientReturning({ value: 'hello' });
    const result = await callWithTool({
      client,
      model: 'claude-sonnet-4-6',
      system: 'system',
      userMessage: 'user',
      tool: baseTool,
    });

    expect(result.rawInput).toEqual({ value: 'hello' });
    expect(result.usage.inputTokens).toBe(100);
    expect(result.usage.outputTokens).toBe(50);
  });

  it('throws if no tool_use block in response', async () => {
    const client: AnthropicClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'no tool' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      },
    } as unknown as AnthropicClient;

    await expect(
      callWithTool({
        client,
        model: 'claude-sonnet-4-6',
        system: 'system',
        userMessage: 'user',
        tool: baseTool,
      }),
    ).rejects.toThrow('Expected tool_use block');
  });
});

describe('callWithValidatedTool', () => {
  const schema = z.object({ value: z.string().min(1) });

  it('parses valid output immediately', async () => {
    const client = makeClientReturning({ value: 'valid' });
    const result = await callWithValidatedTool({
      client,
      model: 'claude-sonnet-4-6',
      system: 'system',
      userMessage: 'user',
      tool: baseTool,
      schema,
    });

    expect(result.data.value).toBe('valid');
    expect(result.usage.inputTokens).toBe(100);
  });

  it('retries on parse failure and succeeds on second attempt', async () => {
    const client: AnthropicClient = {
      messages: {
        create: vi
          .fn()
          // First call returns invalid data (empty string fails min(1))
          .mockResolvedValueOnce(makeToolUseResponse({ value: '' }))
          // Second call returns valid data
          .mockResolvedValueOnce(makeToolUseResponse({ value: 'fixed' })),
      },
    } as unknown as AnthropicClient;

    const result = await callWithValidatedTool({
      client,
      model: 'claude-sonnet-4-6',
      system: 'system',
      userMessage: 'user',
      tool: baseTool,
      schema,
      retries: 1,
    });

    expect(result.data.value).toBe('fixed');
    // Tokens from both attempts are accumulated
    expect(result.usage.inputTokens).toBe(200);
  });

  it('throws after exhausting all retries', async () => {
    const client: AnthropicClient = {
      messages: {
        create: vi.fn().mockResolvedValue(makeToolUseResponse({ value: '' })),
      },
    } as unknown as AnthropicClient;

    await expect(
      callWithValidatedTool({
        client,
        model: 'claude-sonnet-4-6',
        system: 'system',
        userMessage: 'user',
        tool: baseTool,
        schema,
        retries: 2,
      }),
    ).rejects.toThrow('Failed to parse LLM tool output after 3 attempts');
  });
});
