/**
 * GET   /api/topics/[id]  — get one topic
 * PATCH /api/topics/[id]  — partial update (rename, edit audience/voice, pause/activate)
 *
 * Topics are never hard-deleted (issues/sources/candidates reference them);
 * pause via PATCH { status: 'paused' } instead. DELETE returns 405.
 *
 * Auth enforced by middleware. Same-origin guard on mutations.
 */

import { NextResponse } from 'next/server';
import { prisma, createTopicRepository } from '@digest/db';
import { UpdateTopicSchema } from '@digest/shared';
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
    const repo = createTopicRepository(prisma);
    const topic = await repo.findById(params.id);

    if (!topic) {
      return NextResponse.json(err('Topic not found'), { status: 404 });
    }

    return NextResponse.json(ok(topic));
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
    const parsed = UpdateTopicSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ');
      return NextResponse.json(err(message), { status: 400 });
    }

    const repo = createTopicRepository(prisma);
    const existing = await repo.findById(params.id);

    if (!existing) {
      return NextResponse.json(err('Topic not found'), { status: 404 });
    }

    const {
      slug,
      name,
      description,
      audience,
      voice,
      status,
      consentMode,
      tier,
      language,
      brandName,
      brandLogoUrl,
      brandColorHex,
      brandFooterText,
    } = parsed.data;

    const updated = await repo.update(params.id, {
      ...(slug !== undefined ? { slug } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(audience !== undefined ? { audience } : {}),
      ...(voice !== undefined ? { voice } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(consentMode !== undefined ? { consentMode } : {}),
      ...(tier !== undefined ? { tier } : {}),
      ...(language !== undefined ? { language } : {}),
      ...(brandName !== undefined ? { brandName } : {}),
      ...(brandLogoUrl !== undefined ? { brandLogoUrl } : {}),
      ...(brandColorHex !== undefined ? { brandColorHex } : {}),
      ...(brandFooterText !== undefined ? { brandFooterText } : {}),
    });

    return NextResponse.json(ok(updated));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}

export function DELETE(): NextResponse {
  return NextResponse.json(
    err('Topics cannot be deleted. Pause the topic instead (PATCH { status: "paused" }).'),
    { status: 405, headers: { Allow: 'GET, PATCH' } },
  );
}
