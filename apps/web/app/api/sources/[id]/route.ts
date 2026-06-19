/**
 * GET    /api/sources/[id]  — get one source
 * PATCH  /api/sources/[id]  — partial update (toggle, relabel, change url/config)
 * DELETE /api/sources/[id]  — remove a source
 *
 * Auth enforced by middleware. Same-origin guard on mutations.
 */

import { NextResponse } from 'next/server';
import { prisma, createSourceRepository, Prisma } from '@digest/db';
import { UpdateSourceSchema } from '@digest/shared';
import { ok, err } from '@/lib/api-response.js';
import { getErrorMessage } from '@/lib/error.js';
import { assertSameOrigin } from '@/lib/assert-same-origin.js';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const repo = createSourceRepository(prisma);
    const source = await repo.findById(params.id);

    if (!source) {
      return NextResponse.json(err('Source not found'), { status: 404 });
    }

    return NextResponse.json(ok(source));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const csrfCheck = assertSameOrigin(request);
  if (csrfCheck !== null) return csrfCheck;

  try {
    const body: unknown = await request.json();
    const parsed = UpdateSourceSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ');
      return NextResponse.json(err(message), { status: 400 });
    }

    const repo = createSourceRepository(prisma);
    const existing = await repo.findById(params.id);

    if (!existing) {
      return NextResponse.json(err('Source not found'), { status: 404 });
    }

    const { type, label, url, enabled, config } = parsed.data;

    const updated = await repo.update(params.id, {
      ...(type !== undefined ? { type } : {}),
      ...(label !== undefined ? { label } : {}),
      ...(url !== undefined ? { url } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
      ...(config !== undefined ? { config: config as Prisma.InputJsonValue } : {}),
    });

    return NextResponse.json(ok(updated));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const csrfCheck = assertSameOrigin(request);
  if (csrfCheck !== null) return csrfCheck;

  try {
    const repo = createSourceRepository(prisma);
    const existing = await repo.findById(params.id);

    if (!existing) {
      return NextResponse.json(err('Source not found'), { status: 404 });
    }

    const deleted = await repo.delete(params.id);
    return NextResponse.json(ok(deleted));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
