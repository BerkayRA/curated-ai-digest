import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSourceRepository } from '../source-repository.js';

// ---------------------------------------------------------------------------
// Fake PrismaClient — records calls and returns controlled responses.
// No live database required for unit tests.
// ---------------------------------------------------------------------------

type MockFn = ReturnType<typeof vi.fn>;

interface FakeSourceDelegate {
  findMany: MockFn;
  findUnique: MockFn;
  create: MockFn;
  update: MockFn;
  delete: MockFn;
}

function makeFakePrisma(overrides: Partial<FakeSourceDelegate> = {}) {
  const source: FakeSourceDelegate = {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'test-id' }),
    update: vi.fn().mockResolvedValue({ id: 'test-id' }),
    delete: vi.fn().mockResolvedValue({ id: 'test-id' }),
    ...overrides,
  };

  return { source } as unknown as import('@prisma/client').PrismaClient;
}

// ---------------------------------------------------------------------------
// Shared test fixture
// ---------------------------------------------------------------------------

const baseSource = {
  id: 'cuid-1',
  topicId: 'topic_enterprise_ai',
  type: 'rss' as const,
  label: 'OpenAI Blog',
  url: 'https://openai.com/blog/rss.xml',
  enabled: true,
  config: null,
  lastRunAt: null,
  lastStatus: null,
  lastCount: 0,
  lastError: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

// ---------------------------------------------------------------------------
// findAll
// ---------------------------------------------------------------------------

describe('SourceRepository.findAll', () => {
  let fakePrisma: ReturnType<typeof makeFakePrisma>;

  beforeEach(() => {
    fakePrisma = makeFakePrisma({
      findMany: vi.fn().mockResolvedValue([baseSource]),
    });
  });

  it('calls prisma.source.findMany with no filter', async () => {
    const repo = createSourceRepository(fakePrisma);
    const result = await repo.findAll();

    const delegate = (fakePrisma as unknown as { source: FakeSourceDelegate }).source;
    expect(delegate.findMany).toHaveBeenCalledOnce();
    expect(delegate.findMany).toHaveBeenCalledWith({});
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('cuid-1');
  });
});

// ---------------------------------------------------------------------------
// findEnabled
// ---------------------------------------------------------------------------

describe('SourceRepository.findEnabled', () => {
  it('calls prisma.source.findMany with enabled: true filter', async () => {
    const findMany = vi.fn().mockResolvedValue([baseSource]);
    const fakePrisma = makeFakePrisma({ findMany });
    const repo = createSourceRepository(fakePrisma);

    await repo.findEnabled();

    expect(findMany).toHaveBeenCalledWith({ where: { enabled: true } });
  });

  it('returns only enabled sources', async () => {
    const enabled = { ...baseSource, enabled: true };
    const findMany = vi.fn().mockResolvedValue([enabled]);
    const fakePrisma = makeFakePrisma({ findMany });
    const repo = createSourceRepository(fakePrisma);

    const result = await repo.findEnabled();
    expect(result.every((s) => s.enabled)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// findEnabledByTopic
// ---------------------------------------------------------------------------

describe('SourceRepository.findEnabledByTopic', () => {
  it('filters by enabled: true AND the given topicId', async () => {
    const findMany = vi.fn().mockResolvedValue([baseSource]);
    const fakePrisma = makeFakePrisma({ findMany });
    const repo = createSourceRepository(fakePrisma);

    await repo.findEnabledByTopic('topic_enterprise_ai');

    expect(findMany).toHaveBeenCalledWith({
      where: { enabled: true, topicId: 'topic_enterprise_ai' },
    });
  });

  it('returns the rows the delegate yields', async () => {
    const findMany = vi.fn().mockResolvedValue([baseSource]);
    const fakePrisma = makeFakePrisma({ findMany });
    const repo = createSourceRepository(fakePrisma);

    const result = await repo.findEnabledByTopic('topic_enterprise_ai');
    expect(result).toHaveLength(1);
    expect(result[0]?.topicId).toBe('topic_enterprise_ai');
  });
});

// ---------------------------------------------------------------------------
// findById
// ---------------------------------------------------------------------------

describe('SourceRepository.findById', () => {
  it('calls prisma.source.findUnique with the correct id', async () => {
    const findUnique = vi.fn().mockResolvedValue(baseSource);
    const fakePrisma = makeFakePrisma({ findUnique });
    const repo = createSourceRepository(fakePrisma);

    const result = await repo.findById('cuid-1');

    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'cuid-1' } });
    expect(result?.id).toBe('cuid-1');
  });

  it('returns null when the source does not exist', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const fakePrisma = makeFakePrisma({ findUnique });
    const repo = createSourceRepository(fakePrisma);

    const result = await repo.findById('does-not-exist');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe('SourceRepository.create', () => {
  it('calls prisma.source.create with the provided data', async () => {
    const created = { ...baseSource };
    const create = vi.fn().mockResolvedValue(created);
    const fakePrisma = makeFakePrisma({ create });
    const repo = createSourceRepository(fakePrisma);

    const data = {
      topicId: 'topic_enterprise_ai',
      type: 'rss' as const,
      label: 'OpenAI Blog',
      url: 'https://openai.com/blog/rss.xml',
      enabled: true,
    };
    const result = await repo.create(data);

    expect(create).toHaveBeenCalledOnce();
    const callArg = create.mock.calls[0]?.[0] as { data: unknown };
    expect(callArg.data).toMatchObject({
      type: 'rss',
      label: 'OpenAI Blog',
      url: 'https://openai.com/blog/rss.xml',
    });
    expect(result.id).toBe('cuid-1');
  });

  it('passes config when provided', async () => {
    const create = vi.fn().mockResolvedValue(baseSource);
    const fakePrisma = makeFakePrisma({ create });
    const repo = createSourceRepository(fakePrisma);

    await repo.create({
      topicId: 'topic_enterprise_ai',
      type: 'exa',
      label: 'Exa Neural Search',
      enabled: false,
      config: { queries: ['AI news'] },
    });

    const callArg = create.mock.calls[0]?.[0] as { data: { config: unknown } };
    expect(callArg.data.config).toEqual({ queries: ['AI news'] });
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe('SourceRepository.update', () => {
  it('calls prisma.source.update with the correct id and data', async () => {
    const updated = { ...baseSource, label: 'Updated Label' };
    const update = vi.fn().mockResolvedValue(updated);
    const fakePrisma = makeFakePrisma({ update });
    const repo = createSourceRepository(fakePrisma);

    const result = await repo.update('cuid-1', { label: 'Updated Label' });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'cuid-1' },
      data: { label: 'Updated Label' },
    });
    expect(result.label).toBe('Updated Label');
  });

  it('can toggle enabled', async () => {
    const updated = { ...baseSource, enabled: false };
    const update = vi.fn().mockResolvedValue(updated);
    const fakePrisma = makeFakePrisma({ update });
    const repo = createSourceRepository(fakePrisma);

    await repo.update('cuid-1', { enabled: false });

    const callArg = update.mock.calls[0]?.[0] as { data: { enabled: boolean } };
    expect(callArg.data.enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

describe('SourceRepository.delete', () => {
  it('calls prisma.source.delete with the correct id', async () => {
    const del = vi.fn().mockResolvedValue(baseSource);
    const fakePrisma = makeFakePrisma({ delete: del });
    const repo = createSourceRepository(fakePrisma);

    await repo.delete('cuid-1');

    expect(del).toHaveBeenCalledWith({ where: { id: 'cuid-1' } });
  });
});

// ---------------------------------------------------------------------------
// recordHealth
// ---------------------------------------------------------------------------

describe('SourceRepository.recordHealth', () => {
  it('calls prisma.source.update with all health fields on success', async () => {
    const update = vi.fn().mockResolvedValue(baseSource);
    const fakePrisma = makeFakePrisma({ update });
    const repo = createSourceRepository(fakePrisma);

    const runAt = new Date('2026-06-19T08:00:00Z');
    await repo.recordHealth('cuid-1', {
      lastRunAt: runAt,
      lastStatus: 'ok',
      lastCount: 7,
      lastError: null,
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'cuid-1' },
      data: {
        lastRunAt: runAt,
        lastStatus: 'ok',
        lastCount: 7,
        lastError: null,
      },
    });
  });

  it('calls prisma.source.update with error fields on failure', async () => {
    const update = vi.fn().mockResolvedValue(baseSource);
    const fakePrisma = makeFakePrisma({ update });
    const repo = createSourceRepository(fakePrisma);

    const runAt = new Date('2026-06-19T08:00:00Z');
    await repo.recordHealth('cuid-1', {
      lastRunAt: runAt,
      lastStatus: 'error',
      lastCount: 0,
      lastError: 'Feed request failed with status 404',
    });

    const callArg = update.mock.calls[0]?.[0] as {
      data: { lastStatus: string; lastError: string | null };
    };
    expect(callArg.data.lastStatus).toBe('error');
    expect(callArg.data.lastError).toBe('Feed request failed with status 404');
  });

  it('accepts undefined lastError (coerces to null)', async () => {
    const update = vi.fn().mockResolvedValue(baseSource);
    const fakePrisma = makeFakePrisma({ update });
    const repo = createSourceRepository(fakePrisma);

    await repo.recordHealth('cuid-1', {
      lastRunAt: new Date(),
      lastStatus: 'ok',
      lastCount: 3,
    });

    const callArg = update.mock.calls[0]?.[0] as {
      data: { lastError: string | null | undefined };
    };
    // lastError should be null when not provided
    expect(callArg.data.lastError).toBeNull();
  });
});
