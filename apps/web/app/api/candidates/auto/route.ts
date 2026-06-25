/**
 * GET /api/candidates/auto
 *
 * Heuristic, LLM-free auto-curation: scores the recently-scanned pool
 * (recency + source authority + topic-keyword match), picks the best 3 across
 * sources (diversity-aware), and returns them as ready-to-edit draft items.
 * The new-issue page pre-fills its slots with these for review before creating.
 *
 * The lightweight backup to the Claude pipeline — no Anthropic/Exa call, no API
 * key, read-only. Auth is enforced by middleware.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ok, err } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/error';
import { loadRecentCandidates } from '@/lib/candidates';
import { resolveTopicIdFromRequest } from '@/lib/resolve-topic';

export const dynamic = 'force-dynamic';

const PICK_LIMIT = 3;
const PER_SOURCE_CAP = 1;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const topicId = await resolveTopicIdFromRequest(request);
    const { candidates, scannedAt } = await loadRecentCandidates(topicId);
    const { heuristicCurate, candidateToDraftItem, DEFAULT_TOPIC } = await import('@digest/curation');

    const picked = heuristicCurate(candidates, {
      topic: DEFAULT_TOPIC,
      limit: PICK_LIMIT,
      perSourceCap: PER_SOURCE_CAP,
    });
    const items = picked.map(candidateToDraftItem);

    return NextResponse.json(ok({ items, scannedAt, total: candidates.length }));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
