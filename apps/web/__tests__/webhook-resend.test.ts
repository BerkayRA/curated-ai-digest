/**
 * Resend delivery webhook tests — POST /api/webhooks/resend.
 * All DB access is mocked; signatures are computed in-test with the same
 * Svix HMAC scheme the route verifies. No real Prisma or network calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';

const findFirst = vi.fn();
const recordOnce = vi.fn();
const setStatus = vi.fn();

vi.mock('@digest/db', () => ({
  prisma: { send: { findFirst: (...args: unknown[]) => findFirst(...args) } },
  createEmailEventRepository: () => ({ recordOnce }),
  createSubscriberTopicRepository: () => ({ setStatus }),
}));

import { POST } from '../app/api/webhooks/resend/route';

const SECRET = 'whsec_dGVzdHNlY3JldGtleWZvcnVuaXR0ZXN0aW5nMTIz';
const SVIX_ID = 'msg_abc123';
const SVIX_TS = '1700000000';

function sign(rawBody: string): string {
  const keyBytes = Buffer.from(SECRET.replace(/^whsec_/, ''), 'base64');
  const payload = `${SVIX_ID}.${SVIX_TS}.${rawBody}`;
  return createHmac('sha256', keyBytes).update(payload).digest('base64');
}

function makeRequest(body: unknown, opts: { signature?: string } = {}): NextRequest {
  const rawBody = JSON.stringify(body);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'svix-id': SVIX_ID,
    'svix-timestamp': SVIX_TS,
  };
  const signature = opts.signature ?? `v1,${sign(rawBody)}`;
  if (signature) headers['svix-signature'] = signature;
  return new NextRequest('http://localhost/api/webhooks/resend', {
    method: 'POST',
    headers,
    body: rawBody,
  });
}

describe('POST /api/webhooks/resend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('RESEND_WEBHOOK_SECRET', SECRET);
    recordOnce.mockResolvedValue({ id: 'evt-1' });
    setStatus.mockResolvedValue(undefined);
  });

  it('records a delivered event on a valid signature', async () => {
    findFirst.mockResolvedValue({ id: 'send-1', subscriberId: 'sub-1', subscriberTopic: null });

    const res = await POST(
      makeRequest({ type: 'email.delivered', data: { email_id: 'pmid-1' } }),
    );

    expect(res.status).toBe(200);
    expect(recordOnce).toHaveBeenCalledTimes(1);
    const arg = recordOnce.mock.calls[0]![0] as { type: string; sendId: string; providerEventId: string };
    expect(arg.type).toBe('delivered');
    expect(arg.sendId).toBe('send-1');
    expect(arg.providerEventId).toBe(SVIX_ID);
    expect(setStatus).not.toHaveBeenCalled();
  });

  it('returns 401 and skips DB work on an invalid signature', async () => {
    const res = await POST(
      makeRequest({ type: 'email.delivered', data: { email_id: 'pmid-1' } }, {
        signature: 'v1,not-a-valid-signature',
      }),
    );

    expect(res.status).toBe(401);
    expect(findFirst).not.toHaveBeenCalled();
    expect(recordOnce).not.toHaveBeenCalled();
  });

  it('returns 401 when the secret is not configured', async () => {
    vi.stubEnv('RESEND_WEBHOOK_SECRET', '');

    const res = await POST(
      makeRequest({ type: 'email.delivered', data: { email_id: 'pmid-1' } }),
    );

    expect(res.status).toBe(401);
    expect(recordOnce).not.toHaveBeenCalled();
  });

  it('sets the subscriber-topic status to bounced on a bounce', async () => {
    findFirst.mockResolvedValue({
      id: 'send-1',
      subscriberId: 'sub-1',
      subscriberTopic: { topicId: 'topic-1' },
    });

    const res = await POST(
      makeRequest({ type: 'email.bounced', data: { email_id: 'pmid-1' } }),
    );

    expect(res.status).toBe(200);
    expect(recordOnce).toHaveBeenCalledTimes(1);
    expect((recordOnce.mock.calls[0]![0] as { type: string }).type).toBe('bounced');
    expect(setStatus).toHaveBeenCalledWith('sub-1', 'topic-1', 'bounced');
  });

  it('sets bounced status on a complaint', async () => {
    findFirst.mockResolvedValue({
      id: 'send-1',
      subscriberId: 'sub-1',
      subscriberTopic: { topicId: 'topic-1' },
    });

    await POST(makeRequest({ type: 'email.complained', data: { email_id: 'pmid-1' } }));

    expect((recordOnce.mock.calls[0]![0] as { type: string }).type).toBe('complaint');
    expect(setStatus).toHaveBeenCalledWith('sub-1', 'topic-1', 'bounced');
  });

  it('returns 200 with no recordOnce for an unknown provider message id', async () => {
    findFirst.mockResolvedValue(null);

    const res = await POST(
      makeRequest({ type: 'email.delivered', data: { email_id: 'pmid-unknown' } }),
    );

    expect(res.status).toBe(200);
    expect(recordOnce).not.toHaveBeenCalled();
  });

  it('returns 200 no-op for an unmapped event type', async () => {
    const res = await POST(
      makeRequest({ type: 'email.opened', data: { email_id: 'pmid-1' } }),
    );

    expect(res.status).toBe(200);
    expect(findFirst).not.toHaveBeenCalled();
    expect(recordOnce).not.toHaveBeenCalled();
  });
});
