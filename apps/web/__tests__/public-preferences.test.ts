/**
 * Public preference-center endpoint tests — fully DB-free. Mocks @digest/db
 * (prisma + repo factory) and the rate limiter so no real clock, DB, or network
 * is touched.
 *
 * Key invariant under test (FIX 1): the preference center only manages EXISTING
 * memberships. `subscribe` must NEVER create a brand-new membership — a missing
 * row returns 404, never an enrollment that would bypass double opt-in.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const prismaMock = {
  subscriber: { findUnique: vi.fn() },
  subscriberTopic: { findUnique: vi.fn() },
  topic: { findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
};

vi.mock('@digest/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@digest/db')>();
  return {
    ...actual,
    prisma: prismaMock,
    createSubscriberTopicRepository: vi.fn(),
  };
});

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  getClientIp: vi.fn(() => '1.2.3.4'),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TOKEN = 'global-token-abc';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3100/api/public/preferences/' + TOKEN, {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json' }),
    body: JSON.stringify(body),
  });
}

const params = { params: { token: TOKEN } };

async function setup(opts: {
  subscriber?: { id: string } | null;
  membership?: { id: string; status: string } | null;
  topic?: { consentMode: string } | null;
} = {}) {
  const db = await import('@digest/db');

  const setStatus = vi.fn().mockResolvedValue({ id: 'st-1' });
  const upsert = vi.fn().mockResolvedValue({ id: 'st-1' });
  vi.mocked(db.createSubscriberTopicRepository).mockReturnValue({
    setStatus,
    upsert,
  } as unknown as ReturnType<typeof db.createSubscriberTopicRepository>);

  prismaMock.subscriber.findUnique.mockResolvedValue(
    opts.subscriber === undefined ? { id: 'sub-1' } : opts.subscriber,
  );
  prismaMock.subscriberTopic.findUnique.mockResolvedValue(
    opts.membership === undefined ? { id: 'st-1', status: 'unsubscribed' } : opts.membership,
  );
  prismaMock.topic.findUnique.mockResolvedValue(
    opts.topic === undefined ? { consentMode: 'public' } : opts.topic,
  );
  prismaMock.auditLog.create.mockResolvedValue({});

  return { setStatus, upsert };
}

// ===========================================================================
// Tests
// ===========================================================================

describe('POST /api/public/preferences/[token]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 for an unknown subscriber token', async () => {
    await setup({ subscriber: null });
    const { POST } = await import('../app/api/public/preferences/[token]/route');
    const res = await POST(makeRequest({ topicId: 't-1', action: 'unsubscribe' }), params);
    expect(res.status).toBe(404);
  });

  it('unsubscribes an existing membership → 200 + setStatus("unsubscribed")', async () => {
    const { setStatus } = await setup({ membership: { id: 'st-1', status: 'active' } });
    const { POST } = await import('../app/api/public/preferences/[token]/route');
    const res = await POST(makeRequest({ topicId: 't-1', action: 'unsubscribe' }), params);
    expect(res.status).toBe(200);
    expect(setStatus).toHaveBeenCalledWith('sub-1', 't-1', 'unsubscribed');
  });

  it('returns 404 (no throw) when unsubscribing with NO existing membership', async () => {
    const { setStatus } = await setup({ membership: null });
    const { POST } = await import('../app/api/public/preferences/[token]/route');
    const res = await POST(makeRequest({ topicId: 't-1', action: 'unsubscribe' }), params);
    expect(res.status).toBe(404);
    expect(setStatus).not.toHaveBeenCalled();
  });

  it('subscribes a public topic with an existing membership → 200 + single_opt_in', async () => {
    const { upsert } = await setup({
      membership: { id: 'st-1', status: 'unsubscribed' },
      topic: { consentMode: 'public' },
    });
    const { POST } = await import('../app/api/public/preferences/[token]/route');
    const res = await POST(makeRequest({ topicId: 't-1', action: 'subscribe' }), params);
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriberId: 'sub-1',
        topicId: 't-1',
        status: 'active',
        consentBasis: 'single_opt_in',
        consentSource: 'preferences_center',
      }),
    );
  });

  it('returns 404 (no new enrollment) when subscribing with NO existing membership', async () => {
    const { upsert } = await setup({ membership: null, topic: { consentMode: 'public' } });
    const { POST } = await import('../app/api/public/preferences/[token]/route');
    const res = await POST(makeRequest({ topicId: 't-1', action: 'subscribe' }), params);
    expect(res.status).toBe(404);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('returns 403 when subscribing to a business-mode topic (membership exists)', async () => {
    const { upsert } = await setup({
      membership: { id: 'st-1', status: 'unsubscribed' },
      topic: { consentMode: 'business' },
    });
    const { POST } = await import('../app/api/public/preferences/[token]/route');
    const res = await POST(makeRequest({ topicId: 't-1', action: 'subscribe' }), params);
    expect(res.status).toBe(403);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('returns 429 with a Retry-After header when the rate limit is exceeded', async () => {
    await setup();
    const { checkRateLimit } = await import('@/lib/rate-limit');
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, retryAfterMs: 2000 });
    const { POST } = await import('../app/api/public/preferences/[token]/route');
    const res = await POST(makeRequest({ topicId: 't-1', action: 'unsubscribe' }), params);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('2');
  });
});
