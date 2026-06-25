/**
 * POST /api/webhooks/resend — Resend delivery webhooks (Svix-style signing).
 *
 * PUBLIC route (allowlisted in middleware), but every request MUST pass HMAC
 * signature verification before any DB work. The signing secret comes from
 * RESEND_WEBHOOK_SECRET (env only, never the DB). We never log the raw body
 * or any recipient PII.
 */

import { NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
import {
  prisma,
  createEmailEventRepository,
  createSubscriberTopicRepository,
  createSuppressionRepository,
} from '@digest/db';
import type { EmailEventType } from '@digest/db';
import { ok, err } from '@/lib/api-response.js';
import { constantTimeEqual } from '@/lib/webhook-verify.js';

export const dynamic = 'force-dynamic';

const TYPE_MAP: Record<string, EmailEventType> = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complaint',
};

/**
 * Verify the Svix signature. Returns the svix-id (used as the idempotency key)
 * when valid, or null when the secret is missing or no signature matches.
 */
function verifySvixSignature(
  headers: Headers,
  rawBody: string,
  secret: string | undefined,
): string | null {
  if (!secret) return null;
  const svixId = headers.get('svix-id');
  const svixTimestamp = headers.get('svix-timestamp');
  const svixSignature = headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) return null;

  // Replay window: reject stale or future-dated timestamps (±300s of now).
  const ts = parseInt(svixTimestamp, 10);
  if (Number.isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return null;

  const keyBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const payload = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = createHmac('sha256', keyBytes).update(payload).digest('base64');

  const matched = svixSignature
    .split(' ')
    .map((entry) => entry.split(',')[1])
    .some((sig) => sig !== undefined && constantTimeEqual(sig, expected));

  return matched ? svixId : null;
}

interface ResendEvent {
  readonly type?: string;
  readonly data?: {
    readonly email_id?: string;
    /** 'hard' | 'soft' on bounce events; absent on other event types. */
    readonly bounce_type?: string;
    /** Recipient(s); present on most Resend payloads. */
    readonly to?: readonly string[];
    readonly email?: string;
  };
}

/**
 * Resolve the recipient email for a Send. Prefer the webhook payload (no extra
 * query); fall back to the subscriber record. Returns null when unavailable.
 */
async function resolveRecipientEmail(
  data: ResendEvent['data'],
  subscriberId: string,
): Promise<string | null> {
  // Lowercase to match the normalized emails stored in the suppression list.
  const fromPayload = (data?.to?.[0] ?? data?.email)?.toLowerCase();
  if (fromPayload) return fromPayload;

  const subscriber = await prisma.subscriber.findUnique({
    where: { id: subscriberId },
    select: { email: true },
  });
  return subscriber?.email ?? null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();
  const svixId = verifySvixSignature(request.headers, rawBody, process.env.RESEND_WEBHOOK_SECRET);
  if (svixId === null) {
    return NextResponse.json(err('Invalid signature'), { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody) as ResendEvent;
  } catch {
    return NextResponse.json(err('Malformed body'), { status: 400 });
  }

  const type = event.type ? TYPE_MAP[event.type] : undefined;
  const emailId = event.data?.email_id;
  if (!type || !emailId) {
    return NextResponse.json(ok({ ok: true }));
  }

  const send = await prisma.send.findFirst({
    where: { providerMessageId: emailId },
    include: { subscriberTopic: true },
  });
  if (!send) {
    return NextResponse.json(ok({ ok: true }));
  }

  await createEmailEventRepository(prisma).recordOnce({
    sendId: send.id,
    type,
    providerEventId: svixId,
    occurredAt: new Date(),
  });

  if (type !== 'bounced' && type !== 'complaint') {
    return NextResponse.json(ok({ ok: true }));
  }

  if (send.subscriberTopic) {
    await createSubscriberTopicRepository(prisma).setStatus(
      send.subscriberId,
      send.subscriberTopic.topicId,
      'bounced',
    );
  }

  // Soft (transient) bounces only keep the per-membership status above — they
  // do NOT globally suppress. Hard bounces (or bounces with no type) and
  // complaints are added to the suppression firewall.
  const isSoftBounce = type === 'bounced' && event.data?.bounce_type === 'soft';
  if (!isSoftBounce) {
    const email = await resolveRecipientEmail(event.data, send.subscriberId);
    if (email) {
      const suppression = createSuppressionRepository(prisma);
      if (type === 'complaint') {
        await suppression.insertComplaint(email, 'resend_webhook');
      } else {
        await suppression.insertHardBounce(email, 'resend_webhook');
      }
    }
  }

  return NextResponse.json(ok({ ok: true }));
}
