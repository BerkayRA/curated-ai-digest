import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, createSubscriberTopicRepository } from '@digest/db';
import { CreateSubscriberSchema } from '@digest/shared';
import { ok, err } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/error';
import { resolveTopicIdBySlug } from '@/lib/resolve-topic';
import { assertSameOrigin } from '@/lib/assert-same-origin';
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
  const csrfCheck = assertSameOrigin(request);
  if (csrfCheck !== null) return csrfCheck;

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

    const { topicSlug, ...subscriberData } = parsed.data;

    const subscriber = await prisma.subscriber.create({
      data: {
        ...subscriberData,
        unsubscribeToken: randomUUID(),
      },
    });

    // Scope the new subscriber to the active topic (defaults when slug absent).
    const topicId = await resolveTopicIdBySlug(topicSlug);
    await createSubscriberTopicRepository(prisma).upsert({
      subscriberId: subscriber.id,
      topicId,
    });

    return NextResponse.json(ok(subscriber), { status: 201 });
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
