/**
 * Public subscribe endpoint tests — fully DB-free. Mocks @digest/db (prisma +
 * repo factories), @digest/email (provider + render + send), and the rate
 * limiter so no real clock, DB, or network is touched.
 *
 * Key invariant under test: existing-active and new subscribers produce an
 * IDENTICAL 202 body (no enumeration). Topic 404 is the one allowed leak-free
 * non-202 response.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { Topic } from '@digest/db';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const prismaMock = {
  subscriber: { upsert: vi.fn() },
  subscriberTopic: { findUnique: vi.fn() },
  settings: { findFirst: vi.fn() },
};

vi.mock('@digest/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@digest/db')>();
  return {
    ...actual,
    prisma: prismaMock,
    createTopicRepository: vi.fn(),
    createSubscriberTopicRepository: vi.fn(),
  };
});

vi.mock('@digest/email', () => ({
  createEmailProvider: vi.fn(() => ({ kind: 'acs_email' })),
  renderConfirmEmail: vi.fn().mockResolvedValue({ html: '<p>x</p>', text: 'x' }),
  sendTransactionalEmail: vi.fn().mockResolvedValue({ providerMessageId: 'm-1', status: 'sent' }),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  getClientIp: vi.fn(() => '1.2.3.4'),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeTopic = (overrides: Partial<Topic> = {}): Topic =>
  ({
    id: 'topic-1',
    slug: 'enterprise-ai',
    name: 'Enterprise AI',
    consentMode: 'public',
    status: 'active',
    fromAddress: null,
    ...overrides,
  }) as Topic;

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3100/api/public/subscribe', {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json' }),
    body: JSON.stringify(body),
  });
}

async function setup(opts: {
  topic?: Topic | null;
  existingStatus?: string | null;
} = {}) {
  const db = await import('@digest/db');
  vi.mocked(db.createTopicRepository).mockReturnValue({
    findBySlug: vi.fn().mockResolvedValue(opts.topic === undefined ? makeTopic() : opts.topic),
  } as unknown as ReturnType<typeof db.createTopicRepository>);

  const upsertMembership = vi.fn().mockResolvedValue({ id: 'st-1' });
  vi.mocked(db.createSubscriberTopicRepository).mockReturnValue({
    upsert: upsertMembership,
  } as unknown as ReturnType<typeof db.createSubscriberTopicRepository>);

  prismaMock.subscriber.upsert.mockResolvedValue({ id: 'sub-1', email: 'a@example.com' });
  prismaMock.subscriberTopic.findUnique.mockResolvedValue(
    opts.existingStatus ? { id: 'st-1', status: opts.existingStatus } : null,
  );
  prismaMock.settings.findFirst.mockResolvedValue({
    activeProvider: 'acs_email',
    fromAddress: 'sender@digest.test',
  });

  return { upsertMembership };
}

const validBody = (extra: Record<string, unknown> = {}) => ({
  topicSlug: 'enterprise-ai',
  email: 'a@example.com',
  ...extra,
});

// ===========================================================================
// Tests
// ===========================================================================

describe('POST /api/public/subscribe', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when the topic is business consent mode', async () => {
    await setup({ topic: makeTopic({ consentMode: 'business' as Topic['consentMode'] }) });
    const { POST } = await import('../app/api/public/subscribe/route');
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(404);
  });

  it('returns 404 when the topic is paused', async () => {
    await setup({ topic: makeTopic({ status: 'paused' as Topic['status'] }) });
    const { POST } = await import('../app/api/public/subscribe/route');
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(404);
  });

  it('returns 202 silently when the honeypot field is non-empty', async () => {
    const { upsertMembership } = await setup();
    const { POST } = await import('../app/api/public/subscribe/route');
    const res = await POST(makeRequest(validBody({ website: 'http://spam' })));
    expect(res.status).toBe(202);
    expect(upsertMembership).not.toHaveBeenCalled();
    expect(prismaMock.subscriber.upsert).not.toHaveBeenCalled();
  });

  it('returns 202 silently when the submit is faster than the timing threshold', async () => {
    const { upsertMembership } = await setup();
    const { POST } = await import('../app/api/public/subscribe/route');
    // _t stamped "now" → elapsed < 2s → treated as a bot.
    const res = await POST(makeRequest(validBody({ _t: new Date().toISOString() })));
    expect(res.status).toBe(202);
    expect(upsertMembership).not.toHaveBeenCalled();
  });

  it('returns 429 with a Retry-After header when the rate limit is exceeded', async () => {
    await setup();
    const { checkRateLimit } = await import('@/lib/rate-limit');
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterMs: 1000 });
    const { POST } = await import('../app/api/public/subscribe/route');
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('1');
  });

  it('returns 400 on invalid email', async () => {
    await setup();
    const { POST } = await import('../app/api/public/subscribe/route');
    const res = await POST(makeRequest(validBody({ email: 'not-an-email' })));
    expect(res.status).toBe(400);
  });

  it('returns 202 and sends a confirmation for a brand-new subscriber', async () => {
    const { upsertMembership } = await setup({ existingStatus: null });
    const { sendTransactionalEmail } = await import('@digest/email');
    const { POST } = await import('../app/api/public/subscribe/route');

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(202);
    expect(upsertMembership).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', consentSource: 'public_signup' }),
    );
    const arg = upsertMembership.mock.calls[0]?.[0] as { confirmToken: string };
    expect(typeof arg.confirmToken).toBe('string');
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it('returns 202 and does NOT re-send for an already-active member', async () => {
    const { upsertMembership } = await setup({ existingStatus: 'active' });
    const { sendTransactionalEmail } = await import('@digest/email');
    const { POST } = await import('../app/api/public/subscribe/route');

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(202);
    expect(upsertMembership).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it('returns 202 and re-sends for an existing pending member', async () => {
    const { upsertMembership } = await setup({ existingStatus: 'pending' });
    const { sendTransactionalEmail } = await import('@digest/email');
    const { POST } = await import('../app/api/public/subscribe/route');

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(202);
    expect(upsertMembership).toHaveBeenCalledTimes(1);
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it('produces an identical body for existing-active vs new (no enumeration)', async () => {
    await setup({ existingStatus: 'active' });
    const { POST: postActive } = await import('../app/api/public/subscribe/route');
    const activeRes = await postActive(makeRequest(validBody()));
    const activeBody = await activeRes.json();

    vi.clearAllMocks();
    await setup({ existingStatus: null });
    const { POST: postNew } = await import('../app/api/public/subscribe/route');
    const newRes = await postNew(makeRequest(validBody()));
    const newBody = await newRes.json();

    expect(activeRes.status).toBe(newRes.status);
    expect(activeBody).toEqual(newBody);
  });

  it('still returns 202 when the confirmation email send throws', async () => {
    await setup({ existingStatus: null });
    const { sendTransactionalEmail } = await import('@digest/email');
    vi.mocked(sendTransactionalEmail).mockRejectedValueOnce(new Error('SMTP down'));
    const { POST } = await import('../app/api/public/subscribe/route');

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(202);
  });
});
