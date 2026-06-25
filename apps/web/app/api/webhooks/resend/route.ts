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
  readonly data?: { readonly email_id?: string };
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

  if ((type === 'bounced' || type === 'complaint') && send.subscriberTopic) {
    await createSubscriberTopicRepository(prisma).setStatus(
      send.subscriberId,
      send.subscriberTopic.topicId,
      'bounced',
    );
  }

  return NextResponse.json(ok({ ok: true }));
}
