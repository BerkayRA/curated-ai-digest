/**
 * GET  /api/sponsors  — list active sponsors (picker source for other surfaces)
 * POST /api/sponsors  — create a new sponsor (Zod-validated)
 *
 * Auth is enforced by middleware for all /api/* routes.
 * Same-origin guard is applied on mutations (POST).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, createSponsorRepository } from '@digest/db';
import { CreateSponsorSchema } from '@digest/shared';
import { ok, err } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/error';
import { assertSameOrigin } from '@/lib/assert-same-origin';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const repo = createSponsorRepository(prisma);
    const sponsors = await repo.findActive();
    // Project to the minimal picker shape — this endpoint feeds the issue-editor
    // sponsor selector, which needs only id + name. Avoids exposing contactEmail
    // / notes (internal contact metadata) on that surface. The admin list page
    // loads full records server-side via the repository, not this endpoint.
    return NextResponse.json(ok(sponsors.map((s) => ({ id: s.id, name: s.name }))));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfCheck = assertSameOrigin(request);
  if (csrfCheck !== null) return csrfCheck;

  try {
    const body: unknown = await request.json();
    const parsed = CreateSponsorSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ');
      return NextResponse.json(err(message), { status: 400 });
    }

    const { name, websiteUrl, logoUrl, contactEmail, notes, active } = parsed.data;

    const repo = createSponsorRepository(prisma);
    const sponsor = await repo.create({
      name,
      websiteUrl,
      logoUrl: logoUrl ?? null,
      contactEmail: contactEmail ?? null,
      notes: notes ?? null,
      active,
    });

    return NextResponse.json(ok(sponsor), { status: 201 });
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
