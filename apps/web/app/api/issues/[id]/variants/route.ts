/**
 * /api/issues/[id]/variants
 *
 * GET  → list the issue's A/B subject variants (incl. sentCount/openCount).
 * POST → replace the issue's variants (MVP: exactly two — Varyant A / B).
 *
 * Auth + CSRF guarded to match the other dashboard issue routes.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CreateSubjectVariantSchema } from '@digest/shared';
import { ok, err } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/error';
import { assertSameOrigin } from '@/lib/assert-same-origin';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** MVP expects exactly two variants authored together in the editor. */
const VariantsBodySchema = z.array(CreateSubjectVariantSchema).length(2);

export async function GET(_request: Request, props: RouteParams) {
  const params = await props.params;
  try {
    // Defense-in-depth: middleware already guards this route.
    const session = await auth();
    if (!session) return NextResponse.json(err('Unauthorized'), { status: 401 });

    const { prisma, createSubjectVariantRepository } = await import('@digest/db');
    const variants = await createSubjectVariantRepository(prisma).findByIssueId(params.id);
    return NextResponse.json(ok(variants));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}

export async function POST(request: Request, props: RouteParams) {
  const params = await props.params;
  const csrfCheck = assertSameOrigin(request);
  if (csrfCheck !== null) return csrfCheck;

  try {
    await auth();

    const body: unknown = await request.json();
    const parsed = VariantsBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(err(parsed.error.message), { status: 400 });
    }

    const { prisma, createSubjectVariantRepository } = await import('@digest/db');
    const repo = createSubjectVariantRepository(prisma);
    await repo.replaceForIssue(
      params.id,
      parsed.data.map((v) => ({ ...v, issueId: params.id })),
    );

    const variants = await repo.findByIssueId(params.id);
    return NextResponse.json(ok(variants));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
