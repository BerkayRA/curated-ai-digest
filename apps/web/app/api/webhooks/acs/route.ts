/**
 * POST /api/webhooks/acs — Azure Communication Services email delivery reports,
 * delivered via Event Grid.
 *
 * PUBLIC route (allowlisted in middleware). Two request shapes are handled:
 *   1. The Event Grid subscription-validation handshake (no secret required).
 *   2. Real delivery-report events, authenticated by a shared key in the
 *      `aeg-sas-key` header compared against ACS_WEBHOOK_KEY (env only).
 * We never log the raw body or recipient PII.
 */

import { NextResponse } from 'next/server';
import {
  prisma,
  createEmailEventRepository,
  createSubscriberTopicRepository,
  createSuppressionRepository,
} from '@digest/db';
import type { EmailEventType } from '@digest/db';
import { ok, err } from '@/lib/api-response';
import { constantTimeEqual } from '@/lib/webhook-verify';

export const dynamic = 'force-dynamic';

const VALIDATION_EVENT = 'Microsoft.EventGrid.SubscriptionValidationEvent';
const DELIVERY_EVENT = 'Microsoft.Communication.EmailDeliveryReportReceived';

const STATUS_MAP: Record<string, EmailEventType> = {
  Delivered: 'delivered',
  Failed: 'bounced',
  FilteredSpam: 'complaint',
  Quarantined: 'complaint',
  Suppressed: 'complaint',
};

interface EventGridEvent {
  readonly eventType?: string;
  readonly data?: {
    readonly validationCode?: string;
    readonly messageId?: string;
    readonly status?: string;
    readonly deliveryAttemptTimestamp?: string;
  };
}

/** Subscription-validation handshake: echo the validation code, no secret needed. */
function handleValidation(events: EventGridEvent[]): NextResponse | null {
  const first = events[0];
  if (first?.eventType !== VALIDATION_EVENT) return null;
  return NextResponse.json({ validationResponse: first.data?.validationCode });
}

/** Persist one delivery-report event. */
async function processDeliveryEvent(event: EventGridEvent): Promise<void> {
  const status = event.data?.status;
  const messageId = event.data?.messageId;
  const type = status ? STATUS_MAP[status] : undefined;
  if (!type || !messageId) return;

  const send = await prisma.send.findFirst({
    where: { providerMessageId: messageId },
    include: { subscriberTopic: true },
  });
  if (!send) return;

  const occurredAt = new Date(event.data?.deliveryAttemptTimestamp ?? Date.now());
  await createEmailEventRepository(prisma).recordOnce({
    sendId: send.id,
    type,
    providerEventId: `${messageId}:${status}`,
    occurredAt,
  });

  if (type !== 'bounced' && type !== 'complaint') return;

  if (send.subscriberTopic) {
    await createSubscriberTopicRepository(prisma).setStatus(
      send.subscriberId,
      send.subscriberTopic.topicId,
      'bounced',
    );
  }

  // Globally suppress the recipient. ACS Failed → bounced is always a hard
  // bounce here (Event Grid does not report soft bounces). Resolve the email
  // from the subscriber — Send has no email column.
  const subscriber = await prisma.subscriber.findUnique({
    where: { id: send.subscriberId },
    select: { email: true },
  });
  if (!subscriber) return;

  const suppression = createSuppressionRepository(prisma);
  if (type === 'bounced') {
    await suppression.insertHardBounce(subscriber.email, 'acs_webhook');
  } else {
    await suppression.insertComplaint(subscriber.email, 'acs_webhook');
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();

  let events: EventGridEvent[];
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!Array.isArray(parsed)) {
      return NextResponse.json(err('Malformed body'), { status: 400 });
    }
    events = parsed as EventGridEvent[];
  } catch {
    return NextResponse.json(err('Malformed body'), { status: 400 });
  }

  const validation = handleValidation(events);
  if (validation !== null) return validation;

  const expectedKey = process.env.ACS_WEBHOOK_KEY;
  const providedKey = request.headers.get('aeg-sas-key');
  if (!expectedKey || !providedKey || !constantTimeEqual(providedKey, expectedKey)) {
    return NextResponse.json(err('Invalid signature'), { status: 401 });
  }

  for (const event of events) {
    if (event.eventType === DELIVERY_EVENT) {
      await processDeliveryEvent(event);
    }
  }

  return NextResponse.json(ok({ ok: true }));
}
