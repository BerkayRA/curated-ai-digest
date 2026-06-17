/**
 * POST /api/issues/[id]/transition
 * Apply a guarded status transition.
 * Body: { to: IssueStatus, scheduledAt?: string }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { IssueStatusSchema } from '@mega-bulten/shared';
import { ok, err } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/error';
import { transitionIssue } from '@/lib/issue-transition';
import { assertSameOrigin } from '@/lib/assert-same-origin';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

const TransitionBodySchema = z.object({
  to: IssueStatusSchema,
  scheduledAt: z.coerce.date().optional(),
});

interface RouteParams {
  params: { id: string };
}

export async function POST(request: Request, { params }: RouteParams) {
  const csrfCheck = assertSameOrigin(request);
  if (csrfCheck !== null) return csrfCheck;

  try {
    const session = await auth();
    // Middleware guarantees auth on this route; fallback is a safety net only.
    const actorId = session?.user?.id ?? session?.user?.email ?? 'system';

    const body: unknown = await request.json();
    const parsed = TransitionBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(err(parsed.error.message), { status: 400 });
    }

    const { to, scheduledAt } = parsed.data;

    // If scheduling, persist scheduledAt alongside the transition
    if (to === 'scheduled' && scheduledAt) {
      const { prisma } = await import('@mega-bulten/db');
      await prisma.issue.update({
        where: { id: params.id },
        data: { scheduledAt },
      });
    }

    const result = await transitionIssue({
      issueId: params.id,
      to,
      actorId,
    });

    return NextResponse.json(ok(result));
  } catch (error) {
    const msg = getErrorMessage(error);
    const isStateMachineError = msg.startsWith('Invalid issue status transition');
    return NextResponse.json(err(msg), { status: isStateMachineError ? 409 : 500 });
  }
}
