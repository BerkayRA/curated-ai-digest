/**
 * /api/suppression — admin management of the global do-not-send list.
 *
 * GET  ?search=&page=&limit= → paginated suppression rows.
 * POST { email }            → manual suppression entry.
 *
 * Dashboard-guarded (middleware) with same-origin CSRF protection on the
 * state-changing POST, matching the other dashboard mutation routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, createSuppressionRepository } from '@digest/db';
import { CreateSuppressionSchema } from '@digest/shared';
import { ok, err } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/error';
import { assertSameOrigin } from '@/lib/assert-same-origin';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

export async function GET(request: NextRequest) {
  try {
    // Defense-in-depth: middleware already guards this route.
    const session = await auth();
    if (!session) return NextResponse.json(err('Unauthorized'), { status: 401 });

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim() || undefined;
    const page = parsePositiveInt(searchParams.get('page'), 1, Number.MAX_SAFE_INTEGER);
    const limit = parsePositiveInt(searchParams.get('limit'), DEFAULT_LIMIT, MAX_LIMIT);

    const repo = createSuppressionRepository(prisma);
    const [data, total] = await Promise.all([
      repo.listAll({ search, limit, offset: (page - 1) * limit }),
      repo.count({ search }),
    ]);

    return NextResponse.json(ok(data, { total, page, limit }));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const csrfCheck = assertSameOrigin(request);
  if (csrfCheck !== null) return csrfCheck;

  try {
    const body: unknown = await request.json();
    const parsed = CreateSuppressionSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ');
      return NextResponse.json(err(message), { status: 400 });
    }

    const created = await createSuppressionRepository(prisma).insertManual(parsed.data.email);
    return NextResponse.json(ok(created), { status: 201 });
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
