import { describe, it, expect, vi } from 'vitest';
import { createSubscriberTopicRepository } from '../subscriber-topic-repository.js';

// ---------------------------------------------------------------------------
// Fake PrismaClient — records calls, returns controlled responses. No live DB.
// ---------------------------------------------------------------------------

type MockFn = ReturnType<typeof vi.fn>;

interface FakeDelegate {
  findMany: MockFn;
  findUnique: MockFn;
  upsert: MockFn;
  update: MockFn;
  count: MockFn;
  delete: MockFn;
}

function makeFakePrisma(overrides: Partial<FakeDelegate> = {}) {
  const subscriberTopic: FakeDelegate = {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({ id: 'st-1' }),
    update: vi.fn().mockResolvedValue({ id: 'st-1' }),
    count: vi.fn().mockResolvedValue(0),
    delete: vi.fn().mockResolvedValue({ id: 'st-1' }),
    ...overrides,
  };
  return { subscriberTopic } as unknown as import('@prisma/client').PrismaClient;
}

describe('SubscriberTopicRepository', () => {
  it('findBySubscriberId filters by subscriberId', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repo = createSubscriberTopicRepository(makeFakePrisma({ findMany }));

    await repo.findBySubscriberId('sub-1');
    expect(findMany).toHaveBeenCalledWith({
      where: { subscriberId: 'sub-1' },
      select: {
        id: true,
        subscriberId: true,
        topicId: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it('findByTopicId selects a token-free summary', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repo = createSubscriberTopicRepository(makeFakePrisma({ findMany }));

    await repo.findByTopicId('topic-1');
    expect(findMany).toHaveBeenCalledWith({
      where: { topicId: 'topic-1' },
      select: {
        id: true,
        subscriberId: true,
        topicId: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it('findActiveRecipients gates on active membership AND non-blocked global status', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'st-1',
        subscriberId: 'sub-1',
        unsubscribeToken: 'tok-1',
        subscriber: { email: 'a@example.com', displayName: 'A' },
      },
    ]);
    const repo = createSubscriberTopicRepository(makeFakePrisma({ findMany }));

    const recipients = await repo.findActiveRecipients('topic-1');

    expect(findMany).toHaveBeenCalledWith({
      where: {
        topicId: 'topic-1',
        status: 'active',
        subscriber: { status: { notIn: ['unsubscribed', 'bounced'] } },
      },
      select: {
        id: true,
        subscriberId: true,
        unsubscribeToken: true,
        subscriber: { select: { email: true, displayName: true } },
      },
    });
    expect(recipients).toEqual([
      {
        subscriberTopicId: 'st-1',
        subscriberId: 'sub-1',
        email: 'a@example.com',
        displayName: 'A',
        unsubscribeToken: 'tok-1',
      },
    ]);
  });

  it('countByTopicId counts only active, non-blocked recipients', async () => {
    const count = vi.fn().mockResolvedValue(5);
    const repo = createSubscriberTopicRepository(makeFakePrisma({ count }));

    const n = await repo.countByTopicId('topic-1');
    expect(n).toBe(5);
    expect(count).toHaveBeenCalledWith({
      where: {
        topicId: 'topic-1',
        status: 'active',
        subscriber: { status: { notIn: ['unsubscribed', 'bounced'] } },
      },
    });
  });

  it('upsert keys on composite unique and generates a token when omitted', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'st-1' });
    const repo = createSubscriberTopicRepository(makeFakePrisma({ upsert }));

    await repo.upsert({ subscriberId: 'sub-1', topicId: 'topic-1' });
    const arg = upsert.mock.calls[0]?.[0] as {
      where: { subscriberId_topicId: { subscriberId: string; topicId: string } };
      update: { status: string };
      create: { unsubscribeToken: string; status: string };
    };
    expect(arg.where.subscriberId_topicId).toEqual({ subscriberId: 'sub-1', topicId: 'topic-1' });
    expect(arg.create.status).toBe('active');
    expect(typeof arg.create.unsubscribeToken).toBe('string');
    expect(arg.create.unsubscribeToken.length).toBeGreaterThan(0);
  });

  it('upsert reactivates an existing membership to active on re-add', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'st-1' });
    const repo = createSubscriberTopicRepository(makeFakePrisma({ upsert }));

    await repo.upsert({ subscriberId: 'sub-1', topicId: 'topic-1' });
    const arg = upsert.mock.calls[0]?.[0] as { update: { status: string } };
    expect(arg.update.status).toBe('active');
  });

  it('upsert preserves a caller-supplied token', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'st-1' });
    const repo = createSubscriberTopicRepository(makeFakePrisma({ upsert }));

    await repo.upsert({ subscriberId: 'sub-1', topicId: 'topic-1', unsubscribeToken: 'fixed' });
    const arg = upsert.mock.calls[0]?.[0] as { create: { unsubscribeToken: string } };
    expect(arg.create.unsubscribeToken).toBe('fixed');
  });

  it('setStatus updates via the composite key', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'st-1', status: 'unsubscribed' });
    const repo = createSubscriberTopicRepository(makeFakePrisma({ update }));

    await repo.setStatus('sub-1', 'topic-1', 'unsubscribed');
    expect(update).toHaveBeenCalledWith({
      where: { subscriberId_topicId: { subscriberId: 'sub-1', topicId: 'topic-1' } },
      data: { status: 'unsubscribed' },
    });
  });

  it('findByUnsubscribeToken looks up the unique token', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 'st-1' });
    const repo = createSubscriberTopicRepository(makeFakePrisma({ findUnique }));

    await repo.findByUnsubscribeToken('tok-xyz');
    expect(findUnique).toHaveBeenCalledWith({ where: { unsubscribeToken: 'tok-xyz' } });
  });

  it('delete removes via the composite key', async () => {
    const del = vi.fn().mockResolvedValue({ id: 'st-1' });
    const repo = createSubscriberTopicRepository(makeFakePrisma({ delete: del }));

    await repo.delete('sub-1', 'topic-1');
    expect(del).toHaveBeenCalledWith({
      where: { subscriberId_topicId: { subscriberId: 'sub-1', topicId: 'topic-1' } },
    });
  });
});
