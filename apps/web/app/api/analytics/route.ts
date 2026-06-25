import { NextRequest, NextResponse } from 'next/server';
import { prisma, createAnalyticsRepository, createTopicRepository } from '@digest/db';
import { ok, err } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/error';
import { resolveTopicIdFromRequest } from '@/lib/resolve-topic';

export const dynamic = 'force-dynamic';

/**
 * GET /api/analytics?topic=<slug>
 *
 * Returns the full analytics payload for the active topic — summary KPIs,
 * per-issue history, top-clicked URLs, and subscriber growth. All counts are
 * PII-free and topic-scoped; opens are approximate (see repository note).
 */
export async function GET(request: NextRequest) {
  try {
    const topicId = await resolveTopicIdFromRequest(request);
    const analytics = createAnalyticsRepository(prisma);

    const [summary, issues, topClicks, growth, topic] = await Promise.all([
      analytics.getTopicSummary(topicId),
      analytics.getIssueHistory(topicId),
      analytics.getTopClickedUrls(topicId),
      analytics.getSubscriberGrowth(topicId),
      createTopicRepository(prisma).findById(topicId),
    ]);

    return NextResponse.json(
      ok({ summary, issues, topClicks, growth, topicName: topic?.name ?? null }),
    );
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
