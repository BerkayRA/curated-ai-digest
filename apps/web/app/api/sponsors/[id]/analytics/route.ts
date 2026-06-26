/**
 * GET /api/sponsors/[id]/analytics — per-sponsor click performance.
 *
 * Returns engaged-click totals + a per-issue breakdown for issues that
 * carried this sponsor's slot. Read-only; auth enforced by middleware.
 */

import { NextResponse } from 'next/server';
import {
  prisma,
  createSponsorRepository,
  createSponsorAnalyticsRepository,
  type SponsorIssueClickRow,
} from '@digest/db';
import { ok, err } from '@/lib/api-response.js';
import { getErrorMessage } from '@/lib/error.js';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

export interface SponsorAnalyticsPayload {
  totalClicks: number;
  byIssue: SponsorIssueClickRow[];
}

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const sponsorRepo = createSponsorRepository(prisma);
    const sponsor = await sponsorRepo.findById(params.id);

    if (!sponsor) {
      return NextResponse.json(err('Sponsor not found'), { status: 404 });
    }

    const analytics = createSponsorAnalyticsRepository(prisma);
    const [totalClicks, byIssue] = await Promise.all([
      analytics.getTotalSponsorClicks(params.id),
      analytics.getSponsorClicksByIssue(params.id),
    ]);

    const payload: SponsorAnalyticsPayload = { totalClicks, byIssue };
    return NextResponse.json(ok(payload));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
