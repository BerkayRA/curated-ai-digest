import { describe, it, expect, vi } from 'vitest';
import { createAnalyticsRepository } from '../analytics-repository.js';

function makeFakePrisma(opts: {
  queryRaw?: ReturnType<typeof vi.fn>;
  count?: ReturnType<typeof vi.fn>;
}) {
  return {
    $queryRaw: opts.queryRaw ?? vi.fn().mockResolvedValue([]),
    subscriberTopic: { count: opts.count ?? vi.fn().mockResolvedValue(0) },
  } as unknown as import('@prisma/client').PrismaClient;
}

describe('AnalyticsRepository', () => {
  it('getTopicSummary computes open rate and CTR from raw counts', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValue([{ sent_count: 10, unique_opens: 4, unique_clicks: 2 }]);
    const count = vi.fn().mockResolvedValue(8);
    const repo = createAnalyticsRepository(makeFakePrisma({ queryRaw, count }));

    const s = await repo.getTopicSummary('topic-1');
    expect(s.totalSent).toBe(10);
    expect(s.uniqueOpens).toBe(4);
    expect(s.uniqueClicks).toBe(2);
    expect(s.openRate).toBeCloseTo(0.4);
    expect(s.ctr).toBeCloseTo(0.2);
    expect(s.activeSubscribers).toBe(8);
  });

  it('getTopicSummary yields zero rates when nothing sent (no divide-by-zero)', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValue([{ sent_count: 0, unique_opens: 0, unique_clicks: 0 }]);
    const repo = createAnalyticsRepository(makeFakePrisma({ queryRaw }));

    const s = await repo.getTopicSummary('topic-1');
    expect(s.openRate).toBe(0);
    expect(s.ctr).toBe(0);
  });

  it('getTopicSummary tolerates an empty raw result set', async () => {
    const repo = createAnalyticsRepository(makeFakePrisma({ queryRaw: vi.fn().mockResolvedValue([]) }));
    const s = await repo.getTopicSummary('topic-1');
    expect(s.totalSent).toBe(0);
    expect(s.openRate).toBe(0);
  });

  it('getIssueHistory maps snake_case rows to camelCase', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        issue_id: 'i-1',
        iso_week: '2026-W25',
        subject: 'Hafta 25',
        sent_at: new Date('2026-06-18'),
        sent_count: 5,
        unique_opens: 3,
        unique_clicks: 1,
      },
    ]);
    const repo = createAnalyticsRepository(makeFakePrisma({ queryRaw }));

    const rows = await repo.getIssueHistory('topic-1');
    expect(rows[0]).toEqual({
      issueId: 'i-1',
      isoWeek: '2026-W25',
      subject: 'Hafta 25',
      sentAt: new Date('2026-06-18'),
      sentCount: 5,
      uniqueOpens: 3,
      uniqueClicks: 1,
    });
  });

  it('getTopClickedUrls maps rows', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValue([{ url: 'https://x.test/a', click_count: 7 }]);
    const repo = createAnalyticsRepository(makeFakePrisma({ queryRaw }));
    const rows = await repo.getTopClickedUrls('topic-1');
    expect(rows[0]).toEqual({ url: 'https://x.test/a', clickCount: 7 });
  });
});
