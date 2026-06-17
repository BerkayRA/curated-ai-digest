import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@mega-bulten/db';
import { CreateSubscriberSchema } from '@mega-bulten/shared';
import { ok, err } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/error';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const subscribers = await prisma.subscriber.findMany({
      where: status ? { status: status as 'active' | 'unsubscribed' | 'bounced' } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    const total = await prisma.subscriber.count({
      where: status ? { status: status as 'active' | 'unsubscribed' | 'bounced' } : undefined,
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
