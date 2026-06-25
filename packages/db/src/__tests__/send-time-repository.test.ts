import { describe, it, expect, vi } from 'vitest';
import {
  createSendTimeRepository,
  MIN_OPENS_FOR_RECOMMENDATION,
} from '../send-time-repository.js';

function makeFakePrisma(queryRaw: ReturnType<typeof vi.fn>) {
  return { $queryRaw: queryRaw } as unknown as import('@prisma/client').PrismaClient;
}

describe('SendTimeRepository', () => {
  it('maps snake_case buckets to camelCase when opens meet the threshold', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      { day_of_week: 4, hour_of_day: 9, open_count: 18 },
      { day_of_week: 2, hour_of_day: 14, open_count: 5 },
    ]);
    const repo = createSendTimeRepository(makeFakePrisma(queryRaw));

    const buckets = await repo.getOptimalSendWindow('topic-1');

    expect(buckets).toEqual([
      { dayOfWeek: 4, hourOfDay: 9, openCount: 18 },
      { dayOfWeek: 2, hourOfDay: 14, openCount: 5 },
    ]);
  });

  it('returns [] when total opens fall below the recommendation threshold', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      { day_of_week: 4, hour_of_day: 9, open_count: 10 },
      { day_of_week: 2, hour_of_day: 14, open_count: 5 },
    ]);
    const repo = createSendTimeRepository(makeFakePrisma(queryRaw));

    const buckets = await repo.getOptimalSendWindow('topic-1');

    expect(15).toBeLessThan(MIN_OPENS_FOR_RECOMMENDATION);
    expect(buckets).toEqual([]);
  });

  it('returns [] for an empty result set', async () => {
    const repo = createSendTimeRepository(makeFakePrisma(vi.fn().mockResolvedValue([])));
    expect(await repo.getOptimalSendWindow('topic-1')).toEqual([]);
  });

  it('forwards a custom lookback window without throwing', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValue([{ day_of_week: 1, hour_of_day: 8, open_count: 25 }]);
    const repo = createSendTimeRepository(makeFakePrisma(queryRaw));

    const buckets = await repo.getOptimalSendWindow('topic-1', 30);

    expect(queryRaw).toHaveBeenCalledOnce();
    expect(buckets).toEqual([{ dayOfWeek: 1, hourOfDay: 8, openCount: 25 }]);
  });
});
