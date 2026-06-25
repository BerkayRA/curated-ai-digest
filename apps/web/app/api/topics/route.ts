/**
 * GET  /api/topics  — list all topics (active and paused)
 * POST /api/topics  — create a new topic (Zod-validated)
 *
 * Auth is enforced by middleware for all /api/* routes.
 * Same-origin guard is applied on mutations (POST).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, createTopicRepository } from '@digest/db';
import { CreateTopicSchema } from '@digest/shared';
import { ok, err } from '@/lib/api-response.js';
import { getErrorMessage } from '@/lib/error.js';
import { assertSameOrigin } from '@/lib/assert-same-origin.js';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const repo = createTopicRepository(prisma);
    const topics = await repo.findAll();
    return NextResponse.json(ok(topics));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfCheck = assertSameOrigin(request);
  if (csrfCheck !== null) return csrfCheck;

  try {
    const body: unknown = await request.json();
    const parsed = CreateTopicSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ');
      return NextResponse.json(err(message), { status: 400 });
    }

    const { slug, name, description, audience, voice, status } = parsed.data;

    const repo = createTopicRepository(prisma);
    const topic = await repo.create({
      slug,
      name,
      description: description ?? null,
      audience: audience ?? null,
      voice: voice ?? null,
      status,
    });

    return NextResponse.json(ok(topic), { status: 201 });
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
