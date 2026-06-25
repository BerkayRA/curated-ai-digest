/**
 * POST /api/issues/[id]/ab-winner
 *
 * Manually triggers A/B winner selection for an issue. No-ops (with a message)
 * when the issue is not in the 'testing' state. Auth + CSRF guarded.
 */

import { NextResponse } from 'next/server';
import { runAbWinnerJob } from '@digest/delivery';
import { ok, err } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/error';
import { assertSameOrigin } from '@/lib/assert-same-origin';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

export async function POST(request: Request, { params }: RouteParams) {
  const csrfCheck = assertSameOrigin(request);
  if (csrfCheck !== null) return csrfCheck;

  try {
    await auth();

    const result = await runAbWinnerJob({ issueId: params.id });
    if (result === null) {
      return NextResponse.json(
        ok({ message: 'Sayı A/B test aşamasında değil — kazanan seçimi atlandı.' }),
      );
    }

    return NextResponse.json(ok(result));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
