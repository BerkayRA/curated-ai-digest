import { describe, it, expect, vi } from 'vitest';
import { createTopicRepository } from '../topic-repository.js';

// ---------------------------------------------------------------------------
// Fake PrismaClient — records calls, returns controlled responses. No live DB.
// ---------------------------------------------------------------------------

type MockFn = ReturnType<typeof vi.fn>;

interface FakeTopicDelegate {
  findMany: MockFn;
  findUnique: MockFn;
  create: MockFn;
  update: MockFn;
}

function makeFakePrisma(overrides: Partial<FakeTopicDelegate> = {}) {
  const topic: FakeTopicDelegate = {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'topic-1' }),
    update: vi.fn().mockResolvedValue({ id: 'topic-1' }),
    ...overrides,
  };
  return { topic } as unknown as import('@prisma/client').PrismaClient;
}

const baseTopic = {
  id: 'topic_enterprise_ai',
  slug: 'enterprise-ai',
  name: 'on-prem & enterprise AI workflows',
  audience: null,
  voice: null,
  status: 'active' as const,
};

describe('TopicRepository', () => {
  it('findAll queries with no filter', async () => {
    const findMany = vi.fn().mockResolvedValue([baseTopic]);
    const repo = createTopicRepository(makeFakePrisma({ findMany }));

    await repo.findAll();
    expect(findMany).toHaveBeenCalledWith({});
  });

  it('findActive filters by status active', async () => {
    const findMany = vi.fn().mockResolvedValue([baseTopic]);
    const repo = createTopicRepository(makeFakePrisma({ findMany }));

    await repo.findActive();
    expect(findMany).toHaveBeenCalledWith({ where: { status: 'active' } });
  });

  it('findBySlug looks up by unique slug', async () => {
    const findUnique = vi.fn().mockResolvedValue(baseTopic);
    const repo = createTopicRepository(makeFakePrisma({ findUnique }));

    const result = await repo.findBySlug('enterprise-ai');
    expect(findUnique).toHaveBeenCalledWith({ where: { slug: 'enterprise-ai' } });
    expect(result?.slug).toBe('enterprise-ai');
  });

  it('findById looks up by id', async () => {
    const findUnique = vi.fn().mockResolvedValue(baseTopic);
    const repo = createTopicRepository(makeFakePrisma({ findUnique }));

    await repo.findById('topic_enterprise_ai');
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'topic_enterprise_ai' } });
  });

  it('create passes the data through', async () => {
    const create = vi.fn().mockResolvedValue(baseTopic);
    const repo = createTopicRepository(makeFakePrisma({ create }));

    await repo.create({ slug: 'edge-ai', name: 'Edge AI' });
    const callArg = create.mock.calls[0]?.[0] as { data: { slug: string } };
    expect(callArg.data.slug).toBe('edge-ai');
  });

  it('update targets the given id', async () => {
    const update = vi.fn().mockResolvedValue({ ...baseTopic, name: 'Renamed' });
    const repo = createTopicRepository(makeFakePrisma({ update }));

    await repo.update('topic_enterprise_ai', { name: 'Renamed' });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'topic_enterprise_ai' },
      data: { name: 'Renamed' },
    });
  });
});
