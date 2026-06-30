import { describe, it, expect, vi } from 'vitest';
import {
  createSponsorAnalyticsRepository,
  mapSponsorClickRows,
} from '../sponsor-analytics-repository';

function makeFakePrisma(queryRaw: ReturnType<typeof vi.fn>) {
  return { $queryRaw: queryRaw } as unknown as import('@prisma/client').PrismaClient;
}

describe('mapSponsorClickRows', () => {
  it('maps snake_case rows to camelCase', () => {
    const out = mapSponsorClickRows([
      {
        issue_id: 'i-1',
        iso_week: '2026-W25',
        subject: 'Hafta 25',
        sent_at: new Date('2026-06-18'),
        clicks: 7,
      },
    ]);
    expect(out).toEqual([
      {
        issueId: 'i-1',
        isoWeek: '2026-W25',
        subject: 'Hafta 25',
        sentAt: new Date('2026-06-18'),
        clicks: 7,
      },
    ]);
  });

  it('returns an empty array for no rows', () => {
    expect(mapSponsorClickRows([])).toEqual([]);
  });
});

describe('SponsorAnalyticsRepository', () => {
  it('getSponsorClicksByIssue maps the raw result', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValue([
        { issue_id: 'i-1', iso_week: '2026-W25', subject: 'S', sent_at: null, clicks: 3 },
      ]);
    const repo = createSponsorAnalyticsRepository(makeFakePrisma(queryRaw));
    const rows = await repo.getSponsorClicksByIssue('sp-1');
    expect(rows).toEqual([
      { issueId: 'i-1', isoWeek: '2026-W25', subject: 'S', sentAt: null, clicks: 3 },
    ]);
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it('getTotalSponsorClicks returns the count, 0 when empty', async () => {
    const repoWith = createSponsorAnalyticsRepository(
      makeFakePrisma(vi.fn().mockResolvedValue([{ clicks: 12 }])),
    );
    expect(await repoWith.getTotalSponsorClicks('sp-1')).toBe(12);

    const repoEmpty = createSponsorAnalyticsRepository(
      makeFakePrisma(vi.fn().mockResolvedValue([])),
    );
    expect(await repoEmpty.getTotalSponsorClicks('sp-1')).toBe(0);
  });
});
