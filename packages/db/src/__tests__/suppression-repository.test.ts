import { describe, it, expect, vi } from 'vitest';
import { createSuppressionRepository } from '../suppression-repository';

function makeFakePrisma(overrides: {
  upsert?: ReturnType<typeof vi.fn>;
  findMany?: ReturnType<typeof vi.fn>;
  count?: ReturnType<typeof vi.fn>;
  findUnique?: ReturnType<typeof vi.fn>;
  delete?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    suppression: {
      upsert: overrides.upsert ?? vi.fn().mockResolvedValue({ id: 's-1' }),
      findMany: overrides.findMany ?? vi.fn().mockResolvedValue([]),
      count: overrides.count ?? vi.fn().mockResolvedValue(0),
      findUnique: overrides.findUnique ?? vi.fn().mockResolvedValue(null),
      delete: overrides.delete ?? vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as import('@prisma/client').PrismaClient;
}

describe('SuppressionRepository', () => {
  it('insertHardBounce upserts with reason=hard_bounce and the given source', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 's-1', reason: 'hard_bounce' });
    const repo = createSuppressionRepository(makeFakePrisma({ upsert }));

    await repo.insertHardBounce('a@x.test', 'acs_webhook');

    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0]![0] as {
      where: { email: string };
      create: { reason: string; source: string };
      update: { reason: string; source: string };
    };
    expect(arg.where.email).toBe('a@x.test');
    expect(arg.create.reason).toBe('hard_bounce');
    expect(arg.create.source).toBe('acs_webhook');
    expect(arg.update.reason).toBe('hard_bounce');
  });

  it('insertComplaint upserts with reason=complaint', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 's-2', reason: 'complaint' });
    const repo = createSuppressionRepository(makeFakePrisma({ upsert }));

    await repo.insertComplaint('b@x.test', 'resend_webhook');

    const arg = upsert.mock.calls[0]![0] as { create: { reason: string; source: string } };
    expect(arg.create.reason).toBe('complaint');
    expect(arg.create.source).toBe('resend_webhook');
  });

  it('insertManual upserts with reason=manual and source=admin', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 's-3', reason: 'manual' });
    const repo = createSuppressionRepository(makeFakePrisma({ upsert }));

    await repo.insertManual('c@x.test');

    const arg = upsert.mock.calls[0]![0] as { create: { reason: string; source: string } };
    expect(arg.create.reason).toBe('manual');
    expect(arg.create.source).toBe('admin');
  });

  it('isSuppressedBatch queries email: { in: [...] } and returns the matching Set', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ email: 'a@x.test' }, { email: 'c@x.test' }]);
    const repo = createSuppressionRepository(makeFakePrisma({ findMany }));

    const result = await repo.isSuppressedBatch(['a@x.test', 'b@x.test', 'c@x.test']);

    const arg = findMany.mock.calls[0]![0] as { where: { email: { in: string[] } } };
    expect(arg.where.email.in).toEqual(['a@x.test', 'b@x.test', 'c@x.test']);
    expect(result).toEqual(new Set(['a@x.test', 'c@x.test']));
    expect(result.has('b@x.test')).toBe(false);
  });

  it('isSuppressedBatch short-circuits to an empty Set when given no emails', async () => {
    const findMany = vi.fn();
    const repo = createSuppressionRepository(makeFakePrisma({ findMany }));

    const result = await repo.isSuppressedBatch([]);

    expect(result.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('listAll applies the search filter (lowercased contains) and pagination', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repo = createSuppressionRepository(makeFakePrisma({ findMany }));

    await repo.listAll({ search: 'FOO', limit: 25, offset: 50 });

    const arg = findMany.mock.calls[0]![0] as {
      where: { email?: { contains: string } };
      take: number;
      skip: number;
    };
    expect(arg.where.email?.contains).toBe('foo');
    expect(arg.take).toBe(25);
    expect(arg.skip).toBe(50);
  });

  it('count applies the same search filter', async () => {
    const count = vi.fn().mockResolvedValue(3);
    const repo = createSuppressionRepository(makeFakePrisma({ count }));

    const n = await repo.count({ search: 'Bar' });

    const arg = count.mock.calls[0]![0] as { where: { email?: { contains: string } } };
    expect(arg.where.email?.contains).toBe('bar');
    expect(n).toBe(3);
  });

  it('count with no search uses an empty where', async () => {
    const count = vi.fn().mockResolvedValue(0);
    const repo = createSuppressionRepository(makeFakePrisma({ count }));

    await repo.count();

    const arg = count.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(arg.where).toEqual({});
  });

  it('remove deletes by id', async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const repo = createSuppressionRepository(makeFakePrisma({ delete: del }));

    await repo.remove('s-9');

    expect(del).toHaveBeenCalledWith({ where: { id: 's-9' } });
  });
});
