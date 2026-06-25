import { describe, it, expect, vi } from 'vitest';
import { getDefaultTopic, getDefaultTopicId } from '../default-topic.js';

// ---------------------------------------------------------------------------
// Fake PrismaClient — only the topic.findMany delegate is exercised here.
// ---------------------------------------------------------------------------

type MockFn = ReturnType<typeof vi.fn>;

function makeFakePrisma(findMany: MockFn) {
  return { topic: { findMany } } as unknown as import('@prisma/client').PrismaClient;
}

function makeTopic(overrides: { id: string; slug: string; status?: string }) {
  return {
    id: overrides.id,
    slug: overrides.slug,
    name: `Topic ${overrides.slug}`,
    description: null,
    audience: null,
    voice: null,
    status: overrides.status ?? 'active',
    sendDayOfWeek: null,
    sendTime: null,
    timezone: null,
    pipelineLeadDays: null,
    autoSendEnabled: null,
    fromAddress: null,
    replyTo: null,
    brandLogoUrl: null,
    brandColorHex: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getDefaultTopic', () => {
  it('queries only active topics', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([makeTopic({ id: 't1', slug: 'enterprise-ai' })]);
    await getDefaultTopic(makeFakePrisma(findMany));

    expect(findMany).toHaveBeenCalledWith({
      where: { status: 'active' },
      orderBy: { id: 'asc' },
    });
  });

  it('returns the sole active topic when exactly one exists', async () => {
    const topic = makeTopic({ id: 't1', slug: 'enterprise-ai' });
    const findMany = vi.fn().mockResolvedValue([topic]);

    const result = await getDefaultTopic(makeFakePrisma(findMany));
    expect(result.id).toBe('t1');
  });

  it('prefers the enterprise-ai slug when multiple active topics exist', async () => {
    const findMany = vi.fn().mockResolvedValue([
      makeTopic({ id: 't1', slug: 'edge-ai' }),
      makeTopic({ id: 't2', slug: 'enterprise-ai' }),
      makeTopic({ id: 't3', slug: 'fintech-ai' }),
    ]);

    const result = await getDefaultTopic(makeFakePrisma(findMany));
    expect(result.slug).toBe('enterprise-ai');
    expect(result.id).toBe('t2');
  });

  it('falls back to the first active topic when enterprise-ai is absent', async () => {
    const findMany = vi.fn().mockResolvedValue([
      makeTopic({ id: 't1', slug: 'edge-ai' }),
      makeTopic({ id: 't2', slug: 'fintech-ai' }),
    ]);

    const result = await getDefaultTopic(makeFakePrisma(findMany));
    expect(result.id).toBe('t1');
  });

  it('throws when no active topic exists', async () => {
    const findMany = vi.fn().mockResolvedValue([]);

    await expect(getDefaultTopic(makeFakePrisma(findMany))).rejects.toThrow(
      'No active Topic found',
    );
  });
});

describe('getDefaultTopicId', () => {
  it('returns just the id of the resolved default topic', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([makeTopic({ id: 'topic_enterprise_ai', slug: 'enterprise-ai' })]);

    const id = await getDefaultTopicId(makeFakePrisma(findMany));
    expect(id).toBe('topic_enterprise_ai');
  });
});
