import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@digest/db';
import { CreateSubscriberSchema } from '@digest/shared';
import { ok, err } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/error';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

const SubscriberStatusSchema = z.enum(['active', 'unsubscribed', 'bounced']).optional();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawStatus = searchParams.get('status');

    const parsedStatus = SubscriberStatusSchema.safeParse(rawStatus ?? undefined);
    const status = parsedStatus.success ? parsedStatus.data : undefined;

    const subscribers = await prisma.subscriber.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    const total = await prisma.subscriber.count({
      where: status ? { status } : undefined,
    });

    return NextResponse.json(
      ok(subscribers, { total, page: 1, limit: subscribers.length }),
    );
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const parsed = CreateSubscriberSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ');
      return NextResponse.json(err(message), { status: 400 });
    }

    const existing = await prisma.subscriber.findUnique({
      where: { email: parsed.data.email },
    });
    if (existing) {
      return NextResponse.json(err('Bu e-posta adresi zaten kayıtlı'), { status: 409 });
    }

    const subscriber = await prisma.subscriber.create({
      data: {
        ...parsed.data,
        unsubscribeToken: randomUUID(),
      },
    });

    return NextResponse.json(ok(subscriber), { status: 201 });
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
