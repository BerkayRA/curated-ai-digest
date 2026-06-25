import { Prisma, type PrismaClient } from '@prisma/client';

import { prisma as defaultClient } from './index.js';

// ---------------------------------------------------------------------------
// Send-time optimization — buckets historical opens (EmailEvent.occurredAt) by
// day-of-week + hour-of-day per topic to recommend the best send window. This
// is advisory only; the scheduler is not auto-adjusted.
// ---------------------------------------------------------------------------

/** Minimum opens before a recommendation is trustworthy. */
export const MIN_OPENS_FOR_RECOMMENDATION = 20;

export interface HourlyOpenBucket {
  /** 0 = Sunday … 6 = Saturday (UTC). */
  dayOfWeek: number;
  /** 0..23 (UTC). */
  hourOfDay: number;
  openCount: number;
}

export interface SendTimeRepository {
  /**
   * Open buckets (UTC) for a topic over the lookback window, ordered by open
   * count desc. Returns [] when there is insufficient data (< threshold opens)
   * so callers can show an "insufficient data" hint rather than a noisy guess.
   */
  getOptimalSendWindow(topicId: string, lookbackDays?: number): Promise<HourlyOpenBucket[]>;
}

export function createSendTimeRepository(
  client: PrismaClient = defaultClient,
): SendTimeRepository {
  return {
    async getOptimalSendWindow(
      topicId: string,
      lookbackDays = 90,
    ): Promise<HourlyOpenBucket[]> {
      const rows = await client.$queryRaw<
        Array<{ day_of_week: number; hour_of_day: number; open_count: number }>
      >(Prisma.sql`
        SELECT
          EXTRACT(DOW FROM ee.occurred_at AT TIME ZONE 'UTC')::int AS day_of_week,
          EXTRACT(HOUR FROM ee.occurred_at AT TIME ZONE 'UTC')::int AS hour_of_day,
          COUNT(DISTINCT ee.send_id)::int AS open_count
        FROM email_events ee
        JOIN sends s ON s.id = ee.send_id
        JOIN issues i ON i.id = s.issue_id
        WHERE
          i.topic_id = ${topicId}
          AND ee.type = 'open'
          AND ee.occurred_at >= NOW() - (${lookbackDays} || ' days')::interval
        GROUP BY day_of_week, hour_of_day
        ORDER BY open_count DESC
      `);

      const total = rows.reduce((sum, r) => sum + r.open_count, 0);
      if (total < MIN_OPENS_FOR_RECOMMENDATION) return [];

      return rows.map((r) => ({
        dayOfWeek: r.day_of_week,
        hourOfDay: r.hour_of_day,
        openCount: r.open_count,
      }));
    },
  };
}
