/**
 * GET /api/candidates/recent
 *
 * Returns the recently-scanned candidate pool grouped by source, with the top 3
 * per source (most recent first). Powers the LLM-free "Curate" picker on the
 * new-issue page — no Anthropic/Exa call, no API key, read-only.
 *
 * Auth is enforced by middleware.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ok, err } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/error';
import { loadRecentCandidates } from '@/lib/candidates';
import { resolveTopicIdFromRequest } from '@/lib/resolve-topic';

export const dynamic = 'force-dynamic';

const TOP_PER_SOURCE = 3;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const topicId = await resolveTopicIdFromRequest(request);
    const { candidates, scannedAt, source } = await loadRecentCandidates(topicId);
    const { groupBySourceTopN } = await import('@digest/curation');

    const sources = groupBySourceTopN(candidates, TOP_PER_SOURCE).map((group) => ({
      sourceName: group.sourceName,
      items: group.items.map((c) => ({
        id: c.id ?? null,
        title: c.title,
        sourceUrl: c.sourceUrl,
        sourceName: c.sourceName,
        rawExcerpt: c.rawExcerpt,
        publishedAt: c.publishedAt ? c.publishedAt.toISOString() : null,
      })),
    }));

    return NextResponse.json(
      ok({ scannedAt, source, total: candidates.length, sources }),
    );
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
