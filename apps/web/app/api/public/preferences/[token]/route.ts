/**
 * POST /api/public/preferences/[token] — public preference-center mutation.
 *
 * Unauthenticated (token-scoped, NO same-origin guard so it works from email
 * clients). Keyed by the GLOBAL Subscriber.unsubscribeToken. Rate-limited per
 * IP. `subscribe` is rejected for business-mode topics — those can only be
 * joined through the consented channels, never re-joined from here.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma, createSubscriberTopicRepository } from '@digest/db';
import { ok, err } from '@/lib/api-response';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ token: string }>;
}

const PreferenceMutationSchema = z.object({
  topicId: z.string().min(1),
  action: z.enum(['subscribe', 'unsubscribe']),
});

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest, props: RouteParams): Promise<NextResponse> {
  const params = await props.params;
  const rate = checkRateLimit(
    getClientIp(request.headers),
    'preferences',
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
  );
  if (!rate.allowed) {
    return NextResponse.json(err('Çok fazla istek, lütfen biraz sonra tekrar deneyin.'), {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil((rate.retryAfterMs ?? 0) / 1000)) },
    });
  }

  try {
    const body: unknown = await request.json();
    const parsed = PreferenceMutationSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ');
      return NextResponse.json(err(message), { status: 400 });
    }

    const subscriber = await prisma.subscriber.findUnique({
      where: { unsubscribeToken: params.token },
      select: { id: true },
    });
    if (!subscriber) {
      return NextResponse.json(err('Bağlantı geçersiz.'), { status: 404 });
    }

    const { topicId, action } = parsed.data;
    const repo = createSubscriberTopicRepository(prisma);

    // The preference center only manages EXISTING memberships. A token-holder
    // must never be able to enroll into an arbitrary public topic from here —
    // that would bypass the double opt-in flow. Both actions require a row.
    const membership = await prisma.subscriberTopic.findUnique({
      where: { subscriberId_topicId: { subscriberId: subscriber.id, topicId } },
    });
    if (!membership) {
      return NextResponse.json(err('Üyelik bulunamadı.'), { status: 404 });
    }

    if (action === 'unsubscribe') {
      const updated = await repo.setStatus(subscriber.id, topicId, 'unsubscribed');
      await prisma.auditLog.create({
        data: {
          actorId: null,
          action: 'subscriberTopic.unsubscribed',
          entity: 'SubscriberTopic',
          entityId: updated.id,
          meta: { method: 'preferences_center', topicId },
        },
      });
      return NextResponse.json(ok({ status: 'unsubscribed' as const }));
    }

    // action === 'subscribe' — business topics cannot be re-joined here. This
    // only re-activates the existing membership; it never creates a new one.
    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
      select: { consentMode: true },
    });
    if (!topic || topic.consentMode !== 'public') {
      return NextResponse.json(err('Bu listeye herkese açık abonelik kapalı.'), {
        status: 403,
      });
    }

    const updated = await repo.upsert({
      subscriberId: subscriber.id,
      topicId,
      status: 'active',
      consentBasis: 'single_opt_in',
      consentAt: new Date(),
      consentSource: 'preferences_center',
    });
    await prisma.auditLog.create({
      data: {
        actorId: null,
        action: 'subscriberTopic.resubscribed',
        entity: 'SubscriberTopic',
        entityId: updated.id,
        meta: { method: 'preferences_center', topicId },
      },
    });

    return NextResponse.json(ok({ status: 'active' as const }));
  } catch (error) {
    // Log server-side for observability; never echo internals to the client.
    console.error('[public/preferences] unexpected error', error);
    return NextResponse.json(err('İşlem tamamlanamadı.'), { status: 500 });
  }
}
