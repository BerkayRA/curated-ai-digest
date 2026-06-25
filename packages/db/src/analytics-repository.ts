import { Prisma, type PrismaClient } from '@prisma/client';

import { prisma as defaultClient } from './index.js';

// ---------------------------------------------------------------------------
// Analytics aggregation — computed on the fly (≤ low-thousands of sends, so no
// rollup tables). All queries are topic-scoped and PII-free (counts only).
//
// Rate definitions:
//   openRate = uniqueOpens / sentCount   (opens are APPROXIMATE — image-proxy
//              prefetch, e.g. Apple Mail Privacy, inflates them)
//   ctr      = uniqueClicks / sentCount  (clicks per delivered, not per open)
// ---------------------------------------------------------------------------

export interface TopicAnalyticsSummary {
  totalSent: number;
  uniqueOpens: number;
  uniqueClicks: number;
  openRate: number; // 0..1
  ctr: number; // 0..1
  activeSubscribers: number;
}

export interface IssueAnalyticsRow {
  issueId: string;
  isoWeek: string;
  subject: string;
  sentAt: Date | null;
  sentCount: number;
  uniqueOpens: number;
  uniqueClicks: number;
}

export interface ClickedUrlRow {
  url: string;
  clickCount: number;
}

export interface GrowthPoint {
  week: Date;
  additions: number;
}

export interface AnalyticsRepository {
  getTopicSummary(topicId: string): Promise<TopicAnalyticsSummary>;
  getIssueHistory(topicId: string, limit?: number): Promise<IssueAnalyticsRow[]>;
  getTopClickedUrls(topicId: string, limit?: number): Promise<ClickedUrlRow[]>;
  getSubscriberGrowth(topicId: string): Promise<GrowthPoint[]>;
}

const rate = (numerator: number, denominator: number): number =>
  denominator > 0 ? numerator / denominator : 0;

export function createAnalyticsRepository(
  client: PrismaClient = defaultClient,
): AnalyticsRepository {
  return {
    async getTopicSummary(topicId: string): Promise<TopicAnalyticsSummary> {
      const rows = await client.$queryRaw<
        Array<{ sent_count: number; unique_opens: number; unique_clicks: number }>
      >(Prisma.sql`
        SELECT
          COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'sent')::int AS sent_count,
          COUNT(DISTINCT ee.send_id) FILTER (WHERE ee.type = 'open')::int AS unique_opens,
          COUNT(DISTINCT ee.send_id) FILTER (WHERE ee.type = 'click')::int AS unique_clicks
        FROM sends s
        JOIN issues i ON i.id = s.issue_id
        LEFT JOIN email_events ee ON ee.send_id = s.id
        WHERE i.topic_id = ${topicId}
      `);

      const subs = await client.subscriberTopic.count({
        where: {
          topicId,
          status: 'active',
          subscriber: { status: { notIn: ['unsubscribed', 'bounced'] } },
        },
      });

      const r = rows[0] ?? { sent_count: 0, unique_opens: 0, unique_clicks: 0 };
      return {
        totalSent: r.sent_count,
        uniqueOpens: r.unique_opens,
        uniqueClicks: r.unique_clicks,
        openRate: rate(r.unique_opens, r.sent_count),
        ctr: rate(r.unique_clicks, r.sent_count),
        activeSubscribers: subs,
      };
    },

    async getIssueHistory(topicId: string, limit = 20): Promise<IssueAnalyticsRow[]> {
      const rows = await client.$queryRaw<
        Array<{
          issue_id: string;
          iso_week: string;
          subject: string;
          sent_at: Date | null;
          sent_count: number;
          unique_opens: number;
          unique_clicks: number;
        }>
      >(Prisma.sql`
        SELECT
          i.id AS issue_id,
          i.iso_week,
          i.subject,
          i.sent_at,
          COUNT(s.id) FILTER (WHERE s.status = 'sent')::int AS sent_count,
          COUNT(DISTINCT ee.send_id) FILTER (WHERE ee.type = 'open')::int AS unique_opens,
          COUNT(DISTINCT ee.send_id) FILTER (WHERE ee.type = 'click')::int AS unique_clicks
        FROM issues i
        LEFT JOIN sends s ON s.issue_id = i.id
        LEFT JOIN email_events ee ON ee.send_id = s.id
        WHERE i.topic_id = ${topicId}
        GROUP BY i.id, i.iso_week, i.subject, i.sent_at
        ORDER BY i.sent_at DESC NULLS LAST
        LIMIT ${limit}
      `);

      return rows.map((r) => ({
        issueId: r.issue_id,
        isoWeek: r.iso_week,
        subject: r.subject,
        sentAt: r.sent_at,
        sentCount: r.sent_count,
        uniqueOpens: r.unique_opens,
        uniqueClicks: r.unique_clicks,
      }));
    },

    async getTopClickedUrls(topicId: string, limit = 10): Promise<ClickedUrlRow[]> {
      const rows = await client.$queryRaw<Array<{ url: string; click_count: number }>>(
        Prisma.sql`
          SELECT ee.url AS url, COUNT(*)::int AS click_count
          FROM email_events ee
          JOIN sends s ON s.id = ee.send_id
          JOIN issues i ON i.id = s.issue_id
          WHERE i.topic_id = ${topicId} AND ee.type = 'click' AND ee.url IS NOT NULL
          GROUP BY ee.url
          ORDER BY click_count DESC
          LIMIT ${limit}
        `,
      );
      return rows.map((r) => ({ url: r.url, clickCount: r.click_count }));
    },

    async getSubscriberGrowth(topicId: string): Promise<GrowthPoint[]> {
      const rows = await client.$queryRaw<Array<{ week: Date; additions: number }>>(
        Prisma.sql`
          SELECT date_trunc('week', st.created_at) AS week, COUNT(*)::int AS additions
          FROM subscriber_topics st
          WHERE st.topic_id = ${topicId}
          GROUP BY week
          ORDER BY week ASC
        `,
      );
      return rows.map((r) => ({ week: r.week, additions: r.additions }));
    },
  };
}
