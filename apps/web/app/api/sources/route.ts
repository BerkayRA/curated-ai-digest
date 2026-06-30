/**
 * GET  /api/sources  — list all sources
 * POST /api/sources  — create a new source (Zod-validated)
 *
 * Auth is enforced by middleware for all /api/* routes.
 * Same-origin guard is applied on mutations (POST).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, createSourceRepository, Prisma } from '@digest/db';
import { CreateSourceSchema } from '@digest/shared';
import { ok, err } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/error';
import { assertSameOrigin } from '@/lib/assert-same-origin';
import { resolveTopicIdBySlug, resolveTopicIdFromRequest } from '@/lib/resolve-topic';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const topicId = await resolveTopicIdFromRequest(request);
    const repo = createSourceRepository(prisma);
    const sources = await repo.findAllByTopic(topicId);
    return NextResponse.json(ok(sources));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfCheck = assertSameOrigin(request);
  if (csrfCheck !== null) return csrfCheck;

  try {
    const body: unknown = await request.json();
    const parsed = CreateSourceSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ');
      return NextResponse.json(err(message), { status: 400 });
    }

    const { type, label, url, enabled, config } = parsed.data;

    // The active topic travels in the mutation body as `topicSlug`. It's read
    // from the raw JSON (not the schema), since CreateSourceSchema is a
    // discriminatedUnion that doesn't carry the field. A missing/unknown slug
    // degrades to the default topic — preserving single-topic behavior.
    const rawSlug = (body as Record<string, unknown> | null)?.['topicSlug'];
    const topicSlug = typeof rawSlug === 'string' ? rawSlug : undefined;
    const topicId = await resolveTopicIdBySlug(topicSlug);

    const repo = createSourceRepository(prisma);
    const source = await repo.create({
      topicId,
      type,
      label,
      url: url ?? null,
      enabled: enabled ?? true,
      config: config != null ? (config as Prisma.InputJsonValue) : undefined,
    });

    return NextResponse.json(ok(source), { status: 201 });
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
