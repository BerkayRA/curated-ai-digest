/**
 * DELETE /api/suppression/[id] — remove a suppression entry (re-enable sending
 * to that address). Dashboard-guarded with same-origin CSRF protection.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, createSuppressionRepository } from '@digest/db';
import { ok, err } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/error';
import { assertSameOrigin } from '@/lib/assert-same-origin';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { id: string };
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const csrfCheck = assertSameOrigin(request);
  if (csrfCheck !== null) return csrfCheck;

  try {
    const session = await auth();
    const actorId = session?.user?.id ?? session?.user?.email ?? 'system';

    // Look up first so the removed row's reason can be recorded for the audit.
    const existing = await prisma.suppression.findUnique({ where: { id: params.id } });

    await createSuppressionRepository(prisma).remove(params.id);

    await prisma.auditLog.create({
      data: {
        actorId,
        action: 'suppression.removed',
        entity: 'Suppression',
        entityId: params.id,
        meta: { email: existing?.email ?? null, reason: existing?.reason ?? null },
      },
    });

    return NextResponse.json(ok({ deleted: true }));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
