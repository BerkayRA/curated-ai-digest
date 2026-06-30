/**
 * Consent / double opt-in repository tests for createSubscriberTopicRepository.
 * Exercises the Phase 3 behaviors: confirmMembership, findPendingByConfirmToken,
 * and the pending-create / re-activate consent semantics. Fully DB-free using
 * the same fake-prisma pattern as subscriber-topic-repository.test.ts.
 */

import { describe, it, expect, vi } from 'vitest';
import { createSubscriberTopicRepository } from '../subscriber-topic-repository';

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

describe('confirmMembership', () => {
  it('flips a valid pending token to active and returns the updated row', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 'st-9', status: 'pending' });
    const update = vi.fn().mockResolvedValue({ id: 'st-9', status: 'active' });
    const repo = createSubscriberTopicRepository(makeFakePrisma({ findUnique, update }));

    const row = await repo.confirmMembership('tok-pending');

    expect(row).toEqual({ id: 'st-9', status: 'active' });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'st-9' },
      data: expect.objectContaining({
        status: 'active',
        consentBasis: 'double_opt_in',
        consentSource: 'public_signup',
        confirmToken: null,
      }),
    });
  });

  it('returns null when the matched row is not pending (already confirmed)', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 'st-9', status: 'active' });
    const update = vi.fn();
    const repo = createSubscriberTopicRepository(makeFakePrisma({ findUnique, update }));

    const row = await repo.confirmMembership('tok-used');

    expect(row).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it('returns null for an unknown token', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const repo = createSubscriberTopicRepository(makeFakePrisma({ findUnique }));

    expect(await repo.confirmMembership('tok-unknown')).toBeNull();
  });
});

describe('findPendingByConfirmToken', () => {
  it('returns the row when status is pending', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 'st-1', status: 'pending' });
    const repo = createSubscriberTopicRepository(makeFakePrisma({ findUnique }));

    const row = await repo.findPendingByConfirmToken('tok-1');
    expect(row).toEqual({ id: 'st-1', status: 'pending' });
    expect(findUnique).toHaveBeenCalledWith({ where: { confirmToken: 'tok-1' } });
  });

  it('returns null when the matched row is not pending', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 'st-1', status: 'active' });
    const repo = createSubscriberTopicRepository(makeFakePrisma({ findUnique }));

    expect(await repo.findPendingByConfirmToken('tok-1')).toBeNull();
  });

  it('returns null for an unknown token', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const repo = createSubscriberTopicRepository(makeFakePrisma({ findUnique }));

    expect(await repo.findPendingByConfirmToken('nope')).toBeNull();
  });
});

describe('upsert consent semantics', () => {
  it('writes confirmToken + consentSource when creating a pending membership', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'st-1' });
    const repo = createSubscriberTopicRepository(makeFakePrisma({ upsert }));

    await repo.upsert({
      subscriberId: 'sub-1',
      topicId: 'topic-1',
      status: 'pending',
      confirmToken: 'tok-confirm',
      consentSource: 'public_signup',
    });

    const arg = upsert.mock.calls[0]?.[0] as {
      create: { status: string; confirmToken: string | null; consentSource: string | null };
      update: { status: string; confirmToken?: string | null; consentSource?: string | null };
    };
    expect(arg.create.status).toBe('pending');
    expect(arg.create.confirmToken).toBe('tok-confirm');
    expect(arg.create.consentSource).toBe('public_signup');
    expect(arg.update.confirmToken).toBe('tok-confirm');
    expect(arg.update.consentSource).toBe('public_signup');
  });

  it('does NOT clobber an existing consentBasis when consentBasis is omitted on re-activate', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'st-1' });
    const repo = createSubscriberTopicRepository(makeFakePrisma({ upsert }));

    await repo.upsert({ subscriberId: 'sub-1', topicId: 'topic-1', status: 'pending' });

    const arg = upsert.mock.calls[0]?.[0] as { update: Record<string, unknown> };
    // consentBasis must be absent from the update payload (left untouched in DB).
    expect('consentBasis' in arg.update).toBe(false);
  });
});
