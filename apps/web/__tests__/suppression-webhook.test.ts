/**
 * Suppression side-effects of the ACS and Resend delivery webhooks. All DB
 * access is mocked; secrets are stubbed via vi.stubEnv. No real Prisma or
 * network calls. Covers: ACS hard bounce → insertHardBounce, ACS complaint →
 * insertComplaint, Resend hard bounce → insertHardBounce, Resend soft bounce →
 * NEITHER suppression method (but setStatus + recordOnce still fire).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createHmac } from 'node:crypto';

const sendFindFirst = vi.fn();
const subscriberFindUnique = vi.fn();
const recordOnce = vi.fn();
const setStatus = vi.fn();
const insertHardBounce = vi.fn();
const insertComplaint = vi.fn();

vi.mock('@digest/db', () => ({
  prisma: {
    send: { findFirst: (...args: unknown[]) => sendFindFirst(...args) },
    subscriber: { findUnique: (...args: unknown[]) => subscriberFindUnique(...args) },
  },
  createEmailEventRepository: () => ({ recordOnce }),
  createSubscriberTopicRepository: () => ({ setStatus }),
  createSuppressionRepository: () => ({ insertHardBounce, insertComplaint }),
}));

import { POST as ACS_POST } from '../app/api/webhooks/acs/route';
import { POST as RESEND_POST } from '../app/api/webhooks/resend/route';

const ACS_KEY = 'super-secret-acs-key';
const RESEND_SECRET = 'whsec_dGVzdHNlY3JldA=='; // base64("testsecret")

// ── ACS helpers ──────────────────────────────────────────
function acsRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/webhooks/acs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'aeg-sas-key': ACS_KEY },
    body: JSON.stringify(body),
  });
}

function acsEvent(status: string) {
  return [
    {
      eventType: 'Microsoft.Communication.EmailDeliveryReportReceived',
      data: { messageId: 'pmid-1', status, deliveryAttemptTimestamp: '2026-01-01T00:00:00Z' },
    },
  ];
}

// ── Resend helpers ───────────────────────────────────────
function resendRequest(body: unknown): NextRequest {
  const rawBody = JSON.stringify(body);
  const svixId = 'msg_1';
  // Current time so the route's ±300s replay window accepts the request.
  const svixTimestamp = String(Math.floor(Date.now() / 1000));
  const keyBytes = Buffer.from(RESEND_SECRET.replace(/^whsec_/, ''), 'base64');
  const payload = `${svixId}.${svixTimestamp}.${rawBody}`;
  const sig = createHmac('sha256', keyBytes).update(payload).digest('base64');
  return new NextRequest('http://localhost/api/webhooks/resend', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': `v1,${sig}`,
    },
    body: rawBody,
  });
}

describe('suppression webhook side-effects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ACS_WEBHOOK_KEY', ACS_KEY);
    vi.stubEnv('RESEND_WEBHOOK_SECRET', RESEND_SECRET);
    recordOnce.mockResolvedValue({ id: 'evt-1' });
    setStatus.mockResolvedValue(undefined);
    insertHardBounce.mockResolvedValue({ id: 'sup-1' });
    insertComplaint.mockResolvedValue({ id: 'sup-2' });
    sendFindFirst.mockResolvedValue({
      id: 'send-1',
      subscriberId: 'sub-1',
      subscriberTopic: { topicId: 'topic-1' },
    });
    subscriberFindUnique.mockResolvedValue({ email: 'recipient@x.test' });
  });

  it('ACS Failed bounce → insertHardBounce(email, acs_webhook) + records the event', async () => {
    const res = await ACS_POST(acsRequest(acsEvent('Failed')));

    expect(res.status).toBe(200);
    expect((recordOnce.mock.calls[0]![0] as { type: string }).type).toBe('bounced');
    expect(setStatus).toHaveBeenCalledWith('sub-1', 'topic-1', 'bounced');
    expect(insertHardBounce).toHaveBeenCalledWith('recipient@x.test', 'acs_webhook');
    expect(insertComplaint).not.toHaveBeenCalled();
  });

  it('ACS FilteredSpam complaint → insertComplaint(email, acs_webhook)', async () => {
    await ACS_POST(acsRequest(acsEvent('FilteredSpam')));

    expect((recordOnce.mock.calls[0]![0] as { type: string }).type).toBe('complaint');
    expect(insertComplaint).toHaveBeenCalledWith('recipient@x.test', 'acs_webhook');
    expect(insertHardBounce).not.toHaveBeenCalled();
  });

  it('ACS Delivered → no suppression at all', async () => {
    sendFindFirst.mockResolvedValue({ id: 'send-1', subscriberId: 'sub-1', subscriberTopic: null });

    await ACS_POST(acsRequest(acsEvent('Delivered')));

    expect(insertHardBounce).not.toHaveBeenCalled();
    expect(insertComplaint).not.toHaveBeenCalled();
  });

  it('Resend hard bounce → insertHardBounce + records the event + sets bounced status', async () => {
    const res = await RESEND_POST(
      resendRequest({
        type: 'email.bounced',
        data: { email_id: 'pmid-1', bounce_type: 'hard', to: ['recipient@x.test'] },
      }),
    );

    expect(res.status).toBe(200);
    expect((recordOnce.mock.calls[0]![0] as { type: string }).type).toBe('bounced');
    expect(setStatus).toHaveBeenCalledWith('sub-1', 'topic-1', 'bounced');
    expect(insertHardBounce).toHaveBeenCalledWith('recipient@x.test', 'resend_webhook');
    expect(insertComplaint).not.toHaveBeenCalled();
  });

  it('Resend bounce with no bounce_type defaults to a hard bounce', async () => {
    await RESEND_POST(
      resendRequest({ type: 'email.bounced', data: { email_id: 'pmid-1', to: ['r@x.test'] } }),
    );

    expect(insertHardBounce).toHaveBeenCalledWith('r@x.test', 'resend_webhook');
  });

  it('Resend SOFT bounce → NEITHER suppression method, but setStatus + recordOnce still fire', async () => {
    await RESEND_POST(
      resendRequest({
        type: 'email.bounced',
        data: { email_id: 'pmid-1', bounce_type: 'soft', to: ['recipient@x.test'] },
      }),
    );

    expect((recordOnce.mock.calls[0]![0] as { type: string }).type).toBe('bounced');
    expect(setStatus).toHaveBeenCalledWith('sub-1', 'topic-1', 'bounced');
    expect(insertHardBounce).not.toHaveBeenCalled();
    expect(insertComplaint).not.toHaveBeenCalled();
  });

  it('Resend complaint → insertComplaint(email, resend_webhook)', async () => {
    await RESEND_POST(
      resendRequest({
        type: 'email.complained',
        data: { email_id: 'pmid-1', to: ['recipient@x.test'] },
      }),
    );

    expect(insertComplaint).toHaveBeenCalledWith('recipient@x.test', 'resend_webhook');
    expect(insertHardBounce).not.toHaveBeenCalled();
  });

  it('Resend falls back to the subscriber email when the payload omits a recipient', async () => {
    await RESEND_POST(
      resendRequest({ type: 'email.bounced', data: { email_id: 'pmid-1', bounce_type: 'hard' } }),
    );

    expect(subscriberFindUnique).toHaveBeenCalled();
    expect(insertHardBounce).toHaveBeenCalledWith('recipient@x.test', 'resend_webhook');
  });
});
