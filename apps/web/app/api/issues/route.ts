import { NextResponse } from 'next/server';
import { prisma } from '@mega-bulten/db';
import { ok, err } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/error';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const issues = await prisma.issue.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        isoWeek: true,
        status: true,
        subject: true,
        preheader: true,
        scheduledAt: true,
        sentAt: true,
        autoSent: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { items: true } },
      },
    });

    return NextResponse.json(ok(issues));
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
