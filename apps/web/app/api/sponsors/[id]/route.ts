/**
 * GET   /api/sponsors/[id]  — get one sponsor
 * PATCH /api/sponsors/[id]  — partial update (rename, edit urls/contact, activate/deactivate)
 *
 * Sponsors are never hard-deleted (sponsored IssueItems reference them);
 * deactivate via PATCH { active: false } instead. DELETE returns 405.
 *
 * Auth enforced by middleware. Same-origin guard on mutations.
 */

import { NextResponse } from 'next/server';
import { prisma, createSponsorRepository } from '@digest/db';
import { UpdateSponsorSchema } from '@digest/shared';
import { ok, err } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/error';
import { assertSameOrigin } from '@/lib/assert-same-origin';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, props: RouteParams): Promise<NextResponse> {
  const params = await props.params;
  try {
    const repo = createSponsorRepository(prisma);
    const sponsor = await repo.findById(params.id);

    if (!sponsor) {
      return NextResponse.json(err('Sponsor not found'), { status: 404 });
    }

    return NextResponse.json(ok(sponsor));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}

export async function PATCH(request: Request, props: RouteParams): Promise<NextResponse> {
  const params = await props.params;
  const csrfCheck = assertSameOrigin(request);
  if (csrfCheck !== null) return csrfCheck;

  try {
    const body: unknown = await request.json();
    const parsed = UpdateSponsorSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ');
      return NextResponse.json(err(message), { status: 400 });
    }

    const repo = createSponsorRepository(prisma);
    const existing = await repo.findById(params.id);

    if (!existing) {
      return NextResponse.json(err('Sponsor not found'), { status: 404 });
    }

    const { name, websiteUrl, logoUrl, contactEmail, notes, active } = parsed.data;

    const updated = await repo.update(params.id, {
      ...(name !== undefined ? { name } : {}),
      ...(websiteUrl !== undefined ? { websiteUrl } : {}),
      ...(logoUrl !== undefined ? { logoUrl } : {}),
      ...(contactEmail !== undefined ? { contactEmail } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(active !== undefined ? { active } : {}),
    });

    return NextResponse.json(ok(updated));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}

export function DELETE(): NextResponse {
  return NextResponse.json(
    err('Sponsors cannot be deleted. Deactivate the sponsor instead (PATCH { active: false }).'),
    { status: 405, headers: { Allow: 'GET, PATCH' } },
  );
}
