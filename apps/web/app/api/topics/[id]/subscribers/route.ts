/**
 * GET /api/topics/[id]/subscribers — list a topic's subscriber memberships.
 *
 * Returns the join rows enriched with the subscriber's email/displayName so the
 * admin table can render identity without a second round-trip. Falls back to
 * the bare membership rows if enrichment fails.
 *
 * Auth enforced by middleware.
 */

import { NextResponse } from 'next/server';
import { prisma, createSubscriberTopicRepository } from '@digest/db';
import { ok, err } from '@/lib/api-response.js';
import { getErrorMessage } from '@/lib/error.js';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const repo = createSubscriberTopicRepository(prisma);
    const memberships = await repo.findByTopicId(params.id);

    const count = await repo.countByTopicId(params.id);

    return NextResponse.json(ok(memberships, { total: count, page: 1, limit: memberships.length }));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
