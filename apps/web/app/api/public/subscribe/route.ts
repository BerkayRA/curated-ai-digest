/**
 * Public self-serve subscribe endpoint (double opt-in).
 *
 * This route is intentionally PUBLIC and cross-origin (embedded signup forms),
 * so there is NO same-origin assertion. It is protected by a fixed-window rate
 * limiter plus honeypot + submit-timing bot heuristics.
 *
 * No enumeration: every non-bot, non-rate-limited, valid request for a real
 * public topic returns an identical 202 regardless of whether the address was
 * already subscribed. The single exception is a 404 for an unknown/non-public
 * topic, which leaks nothing about any subscriber.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  prisma,
  createTopicRepository,
  createSubscriberTopicRepository,
  type Topic,
} from '@digest/db';
import {
  createEmailProvider,
  renderConfirmEmail,
  sendTransactionalEmail,
} from '@digest/email';
import { TopicSlugSchema, emailSchema } from '@digest/shared';
import { ok, err } from '@/lib/api-response';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Rate limit: 5 subscribe attempts per IP per 10-minute window.
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;
// Minimum render-to-submit interval; faster than this is almost certainly a bot.
const MIN_SUBMIT_MS = 2000;

const SubscribeSchema = z.object({
  topicSlug: TopicSlugSchema,
  email: emailSchema,
  displayName: z.string().max(120).optional(),
  /** Honeypot field — real users never fill it. */
  website: z.string().optional(),
  /** ISO timestamp stamped on the page at render time (submit-timing check). */
  _t: z.string().optional(),
});

type SubscribeInput = z.infer<typeof SubscribeSchema>;

// Silent 202: bots and already-subscribed users get the same opaque success.
const silentOk = () => NextResponse.json(ok({}), { status: 202 });

export async function POST(request: NextRequest) {
  const limit = checkRateLimit(getClientIp(request.headers), 'subscribe', RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(err('Çok fazla istek. Lütfen biraz sonra tekrar deneyin.'), {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil((limit.retryAfterMs ?? 0) / 1000)) },
    });
  }

  try {
    const body: unknown = await request.json().catch(() => ({}));

    // Honeypot / timing checks run on the raw body before strict validation so a
    // bot that submits extra junk is still silently rejected.
    if (isBotSubmission(body)) return silentOk();

    const parsed = SubscribeSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ');
      return NextResponse.json(err(message), { status: 400 });
    }

    const topic = await resolvePublicTopic(parsed.data.topicSlug);
    if (!topic) {
      return NextResponse.json(err('Konu bulunamadı.'), { status: 404 });
    }

    await enrollPending(parsed.data, topic);
    return silentOk();
  } catch (error) {
    // Log server-side for observability; never echo internals to the client.
    console.error('[public/subscribe] unexpected error', error);
    return NextResponse.json(err('İşlem tamamlanamadı.'), { status: 500 });
  }
}

/**
 * Bot heuristics: a non-empty honeypot `website`, or a submit that arrives
 * sooner than a human could plausibly fill the form.
 */
function isBotSubmission(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  const record = body as Record<string, unknown>;

  const website = record.website;
  if (typeof website === 'string' && website.trim().length > 0) return true;

  const stamp = record._t;
  if (typeof stamp === 'string') {
    const renderedAt = Date.parse(stamp);
    if (!Number.isNaN(renderedAt) && Date.now() - renderedAt < MIN_SUBMIT_MS) return true;
  }
  return false;
}

/** Resolve a topic only when it is public AND active; otherwise null (→ 404). */
async function resolvePublicTopic(slug: string): Promise<Topic | null> {
  const topic = await createTopicRepository(prisma).findBySlug(slug);
  if (!topic || topic.consentMode !== 'public' || topic.status !== 'active') return null;
  return topic;
}

/**
 * Upsert the subscriber, create/refresh a pending membership, and send the
 * confirmation email. Already-active members are a silent no-op (no re-send,
 * no leak). consentBasis is left null here — confirmMembership stamps
 * double_opt_in when the recipient confirms.
 */
async function enrollPending(input: SubscribeInput, topic: Topic): Promise<void> {
  const { email, displayName } = input;

  const subscriber = await prisma.subscriber.upsert({
    where: { email },
    // No update fields: an unauthenticated caller who knows an email must not be
    // able to mutate an existing account's displayName. Only set it on create.
    update: {},
    create: {
      email,
      displayName: displayName ?? null,
      unsubscribeToken: globalThis.crypto.randomUUID(),
      status: 'active',
      source: 'public_signup',
      locale: 'tr-TR',
    },
  });

  const existing = await prisma.subscriberTopic.findUnique({
    where: { subscriberId_topicId: { subscriberId: subscriber.id, topicId: topic.id } },
  });
  if (existing && existing.status === 'active') return;

  const confirmToken = globalThis.crypto.randomUUID();
  await createSubscriberTopicRepository(prisma).upsert({
    subscriberId: subscriber.id,
    topicId: topic.id,
    status: 'pending',
    confirmToken,
    consentSource: 'public_signup',
  });

  await sendConfirmation(email, topic, confirmToken);
}

/**
 * Render and send the double opt-in confirmation. Send failures are logged
 * server-side but never surfaced to the client (the response stays 202): the
 * membership row already exists, so the user can re-submit to trigger a fresh
 * confirmation rather than the request hard-failing.
 */
async function sendConfirmation(email: string, topic: Topic, confirmToken: string): Promise<void> {
  if (!process.env.APP_BASE_URL) {
    console.error('[public/subscribe] APP_BASE_URL unset; confirmation link will be broken');
  }
  try {
    const settings = await prisma.settings.findFirst();
    if (!settings) throw new Error('E-posta ayarları bulunamadı.');

    const provider = createEmailProvider(settings.activeProvider);
    const confirmUrl = `${process.env.APP_BASE_URL ?? ''}/confirm/${confirmToken}`;
    const { html, text } = await renderConfirmEmail({
      topicName: topic.name,
      confirmUrl,
      senderAddress: settings.fromAddress,
    });

    await sendTransactionalEmail(provider, {
      to: { email },
      from: { email: topic.fromAddress ?? settings.fromAddress },
      subject: `${topic.name} aboneliğinizi onaylayın`,
      html,
      text,
    });
  } catch (error) {
    // Log but never surface send failures to the client (still 202). The row
    // already exists, so a re-submit can trigger a fresh confirmation.
    console.error('[public/subscribe] confirm email send failed', error);
  }
}
