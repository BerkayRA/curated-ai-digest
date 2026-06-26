import { Prisma, type PrismaClient } from '@prisma/client';

import { prisma as defaultClient } from './index.js';

// ---------------------------------------------------------------------------
// Sponsor performance analytics (Phase 6). Reuses the Phase 2 click analytics:
// engaged clicks to a sponsor's sponsored IssueItems, broken down by issue.
//
// "Engaged clicks" = EmailEvent rows of type 'click' on Sends of issues that
// contain a sponsored item for this sponsor. Counts only (PII-free).
//
// NOTE: clicks are attributed at the ISSUE level (an EmailEvent links to a Send,
// not to a specific item), so the number reflects clicks on sends of issues that
// carried this sponsor's slot — the same granularity as the existing per-issue
// click metric. Documented so the dashboard label matches reality.
// ---------------------------------------------------------------------------

export interface SponsorIssueClickRow {
  issueId: string;
  isoWeek: string;
  subject: string;
  sentAt: Date | null;
  clicks: number;
}

export interface SponsorAnalyticsRepository {
  /** Per-issue click counts for issues carrying this sponsor's slot, newest first. */
  getSponsorClicksByIssue(sponsorId: string, limit?: number): Promise<SponsorIssueClickRow[]>;
  /** Total engaged clicks across all of this sponsor's sponsored issues. */
  getTotalSponsorClicks(sponsorId: string): Promise<number>;
}

/** Pure mapper from raw snake_case rows to the camelCase row shape (unit-tested). */
export function mapSponsorClickRows(
  rows: ReadonlyArray<{
    issue_id: string;
    iso_week: string;
    subject: string;
    sent_at: Date | null;
    clicks: number;
  }>,
): SponsorIssueClickRow[] {
  return rows.map((r) => ({
    issueId: r.issue_id,
    isoWeek: r.iso_week,
    subject: r.subject,
    sentAt: r.sent_at,
    clicks: r.clicks,
  }));
}

export function createSponsorAnalyticsRepository(
  client: PrismaClient = defaultClient,
): SponsorAnalyticsRepository {
  return {
    async getSponsorClicksByIssue(sponsorId, limit = 20): Promise<SponsorIssueClickRow[]> {
      const rows = await client.$queryRaw<
        Array<{
          issue_id: string;
          iso_week: string;
          subject: string;
          sent_at: Date | null;
          clicks: number;
        }>
      >(Prisma.sql`
        SELECT
          i.id AS issue_id,
          i.iso_week,
          i.subject,
          i.sent_at,
          COUNT(ee.id) FILTER (WHERE ee.type = 'click')::int AS clicks
        FROM issues i
        JOIN issue_items it ON it.issue_id = i.id
          AND it.kind = 'sponsored' AND it.sponsor_id = ${sponsorId}
        LEFT JOIN sends s ON s.issue_id = i.id
        LEFT JOIN email_events ee ON ee.send_id = s.id
        GROUP BY i.id, i.iso_week, i.subject, i.sent_at
        ORDER BY i.sent_at DESC NULLS LAST
        LIMIT ${limit}
      `);
      return mapSponsorClickRows(rows);
    },

    async getTotalSponsorClicks(sponsorId): Promise<number> {
      const rows = await client.$queryRaw<Array<{ clicks: number }>>(Prisma.sql`
        SELECT COUNT(ee.id)::int AS clicks
        FROM issue_items it
        JOIN sends s ON s.issue_id = it.issue_id
        JOIN email_events ee ON ee.send_id = s.id AND ee.type = 'click'
        WHERE it.kind = 'sponsored' AND it.sponsor_id = ${sponsorId}
      `);
      return rows[0]?.clicks ?? 0;
    },
  };
}
