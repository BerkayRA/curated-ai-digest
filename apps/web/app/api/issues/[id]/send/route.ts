/**
 * POST /api/issues/[id]/send
 * Dispatch the issue immediately to all active subscribers.
 * The issue must be in 'approved' status before calling this.
 */

import { NextResponse } from 'next/server';
import { ok, err } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/error';
import { dispatchIssue } from '@/lib/dispatch';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    // Middleware guarantees auth on this route; fallback is a safety net only.
    const actorId = session?.user?.id ?? session?.user?.email ?? 'system';

    const result = await dispatchIssue(params.id, { actorId });

    return NextResponse.json(ok(result));
  } catch (error) {
    const msg = getErrorMessage(error);
    return NextResponse.json(err(msg), { status: 500 });
  }
}
