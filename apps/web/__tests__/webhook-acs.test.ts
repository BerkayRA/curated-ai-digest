/**
 * Azure Communication Services delivery webhook tests — POST /api/webhooks/acs.
 * All DB access is mocked; the shared key is set via vi.stubEnv. No real
 * Prisma or network calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const findFirst = vi.fn();
const recordOnce = vi.fn();
const setStatus = vi.fn();

vi.mock('@digest/db', () => ({
  prisma: { send: { findFirst: (...args: unknown[]) => findFirst(...args) } },
  createEmailEventRepository: () => ({ recordOnce }),
  createSubscriberTopicRepository: () => ({ setStatus }),
}));

import { POST } from '../app/api/webhooks/acs/route';

const KEY = 'super-secret-acs-key';

function makeRequest(body: unknown, opts: { key?: string | null } = {}): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const key = opts.key === undefined ? KEY : opts.key;
  if (key) headers['aeg-sas-key'] = key;
  return new NextRequest('http://localhost/api/webhooks/acs', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function deliveryEvent(status: string, messageId = 'pmid-1') {
  return {
    eventType: 'Microsoft.Communication.EmailDeliveryReportReceived',
    data: { messageId, status, deliveryAttemptTimestamp: '2026-01-01T00:00:00Z' },
  };
}

describe('POST /api/webhooks/acs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ACS_WEBHOOK_KEY', KEY);
    recordOnce.mockResolvedValue({ id: 'evt-1' });
    setStatus.mockResolvedValue(undefined);
  });

  it('echoes the validation code on the subscription handshake (no key needed)', async () => {
    const res = await POST(
      makeRequest(
        [
          {
            eventType: 'Microsoft.EventGrid.SubscriptionValidationEvent',
            data: { validationCode: 'code-xyz' },
          },
        ],
        { key: null },
      ),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { validationResponse: string };
    expect(json.validationResponse).toBe('code-xyz');
    expect(recordOnce).not.toHaveBeenCalled();
  });

  it('records a delivered event with a valid key', async () => {
    findFirst.mockResolvedValue({ id: 'send-1', subscriberId: 'sub-1', subscriberTopic: null });

    const res = await POST(makeRequest([deliveryEvent('Delivered')]));

    expect(res.status).toBe(200);
    expect(recordOnce).toHaveBeenCalledTimes(1);
    const arg = recordOnce.mock.calls[0]![0] as { type: string; providerEventId: string };
    expect(arg.type).toBe('delivered');
    expect(arg.providerEventId).toBe('pmid-1:Delivered');
    expect(setStatus).not.toHaveBeenCalled();
  });

  it('returns 401 and skips DB work when the key is missing', async () => {
    const res = await POST(makeRequest([deliveryEvent('Delivered')], { key: null }));

    expect(res.status).toBe(401);
    expect(findFirst).not.toHaveBeenCalled();
    expect(recordOnce).not.toHaveBeenCalled();
  });

  it('returns 401 on a mismatched key', async () => {
    const res = await POST(makeRequest([deliveryEvent('Delivered')], { key: 'wrong-key' }));

    expect(res.status).toBe(401);
    expect(recordOnce).not.toHaveBeenCalled();
  });

  it('sets subscriber-topic status to bounced on a Failed report', async () => {
    findFirst.mockResolvedValue({
      id: 'send-1',
      subscriberId: 'sub-1',
      subscriberTopic: { topicId: 'topic-1' },
    });

    await POST(makeRequest([deliveryEvent('Failed')]));

    expect((recordOnce.mock.calls[0]![0] as { type: string }).type).toBe('bounced');
    expect(setStatus).toHaveBeenCalledWith('sub-1', 'topic-1', 'bounced');
  });

  it('maps FilteredSpam to a complaint and sets bounced status', async () => {
    findFirst.mockResolvedValue({
      id: 'send-1',
      subscriberId: 'sub-1',
      subscriberTopic: { topicId: 'topic-1' },
    });

    await POST(makeRequest([deliveryEvent('FilteredSpam')]));

    expect((recordOnce.mock.calls[0]![0] as { type: string }).type).toBe('complaint');
    expect(setStatus).toHaveBeenCalledWith('sub-1', 'topic-1', 'bounced');
  });

  it('returns 200 with no recordOnce for an unknown provider message id', async () => {
    findFirst.mockResolvedValue(null);

    const res = await POST(makeRequest([deliveryEvent('Delivered', 'pmid-unknown')]));

    expect(res.status).toBe(200);
    expect(recordOnce).not.toHaveBeenCalled();
  });

  it('skips events with an unmapped status', async () => {
    const res = await POST(makeRequest([deliveryEvent('Pending')]));

    expect(res.status).toBe(200);
    expect(findFirst).not.toHaveBeenCalled();
    expect(recordOnce).not.toHaveBeenCalled();
  });
});
