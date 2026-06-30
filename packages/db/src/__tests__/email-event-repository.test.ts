import { describe, it, expect, vi } from 'vitest';
import { createEmailEventRepository } from '../email-event-repository';

type MockFn = ReturnType<typeof vi.fn>;

interface FakeDelegate {
  create: MockFn;
  findUnique: MockFn;
  count: MockFn;
  findMany: MockFn;
}

function makeFakePrisma(overrides: Partial<FakeDelegate> = {}) {
  const emailEvent: FakeDelegate = {
    create: vi.fn().mockResolvedValue({ id: 'ev-1' }),
    findUnique: vi.fn().mockResolvedValue(null),
    count: vi.fn().mockResolvedValue(0),
    findMany: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
  return { emailEvent } as unknown as import('@prisma/client').PrismaClient;
}

const occurredAt = new Date('2026-06-25T10:00:00Z');

describe('EmailEventRepository', () => {
  it('record inserts an event with nulled optional fields', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'ev-1' });
    const repo = createEmailEventRepository(makeFakePrisma({ create }));

    await repo.record({ sendId: 'send-1', type: 'open', occurredAt });
    expect(create).toHaveBeenCalledWith({
      data: {
        sendId: 'send-1',
        type: 'open',
        url: null,
        urlIndex: null,
        ipHash: null,
        uaClass: null,
        providerEventId: null,
        occurredAt,
      },
    });
  });

  it('recordOnce reuses an existing event with the same providerEventId', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 'existing', providerEventId: 'p-1' });
    const create = vi.fn();
    const repo = createEmailEventRepository(makeFakePrisma({ findUnique, create }));

    const result = await repo.recordOnce({
      sendId: 'send-1',
      type: 'delivered',
      providerEventId: 'p-1',
      occurredAt,
    });

    expect(result.id).toBe('existing');
    expect(create).not.toHaveBeenCalled();
  });

  it('recordOnce inserts when the providerEventId is new', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue({ id: 'ev-new' });
    const repo = createEmailEventRepository(makeFakePrisma({ findUnique, create }));

    await repo.recordOnce({
      sendId: 'send-1',
      type: 'bounced',
      providerEventId: 'p-2',
      occurredAt,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ providerEventId: 'p-2' }) }),
    );
  });

  it('hasRecentOpen returns true when a matching open exists in window', async () => {
    const count = vi.fn().mockResolvedValue(1);
    const repo = createEmailEventRepository(makeFakePrisma({ count }));

    const since = new Date('2026-06-25T09:00:00Z');
    const result = await repo.hasRecentOpen('send-1', 'iphash', since);
    expect(result).toBe(true);
    expect(count).toHaveBeenCalledWith({
      where: { sendId: 'send-1', type: 'open', ipHash: 'iphash', occurredAt: { gte: since } },
    });
  });

  it('hasRecentOpen returns false when none', async () => {
    const repo = createEmailEventRepository(makeFakePrisma({ count: vi.fn().mockResolvedValue(0) }));
    expect(await repo.hasRecentOpen('send-1', 'h', new Date())).toBe(false);
  });
});
