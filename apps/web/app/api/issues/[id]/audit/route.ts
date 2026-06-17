/**
 * GET /api/issues/[id]/audit
 * Returns AuditLog entries for a specific issue, newest first.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@mega-bulten/db';
import { ok, err } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/error';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { entity: 'Issue', entityId: params.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(ok(logs));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
