/**
 * GET /api/subscribers/[id]/topics — list a subscriber's topic memberships.
 * PUT /api/subscribers/[id]/topics — add/remove the subscriber to/from a topic.
 *
 * PUT body: { topicId: string, action: 'add' | 'remove' }.
 *   add    → upsert membership (reactivates if it already exists)
 *   remove → delete the membership row
 *
 * Auth enforced by middleware. Same-origin guard on the mutation.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, createSubscriberTopicRepository } from '@digest/db';
import { ok, err } from '@/lib/api-response.js';
import { getErrorMessage } from '@/lib/error.js';
import { assertSameOrigin } from '@/lib/assert-same-origin.js';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

const MembershipMutationSchema = z.object({
  topicId: z.string().min(1, 'topicId gerekli'),
  action: z.enum(['add', 'remove']),
});

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const repo = createSubscriberTopicRepository(prisma);
    const memberships = await repo.findBySubscriberId(params.id);
    return NextResponse.json(ok(memberships));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}

export async function PUT(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const csrfCheck = assertSameOrigin(request);
  if (csrfCheck !== null) return csrfCheck;

  try {
    const body: unknown = await request.json();
    const parsed = MembershipMutationSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ');
      return NextResponse.json(err(message), { status: 400 });
    }

    const { topicId, action } = parsed.data;
    const repo = createSubscriberTopicRepository(prisma);

    if (action === 'remove') {
      await repo.delete(params.id, topicId);
      return NextResponse.json(ok({ subscriberId: params.id, topicId, action }));
    }

    const membership = await repo.upsert({
      subscriberId: params.id,
      topicId,
      status: 'active',
    });
    return NextResponse.json(ok(membership));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
