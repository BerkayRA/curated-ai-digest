/**
 * Subscriber↔topic membership API tests — covers:
 *   GET /api/subscribers/[id]/topics     (list a subscriber's memberships)
 *   PUT /api/subscribers/[id]/topics     (add / remove membership)
 *   GET /api/topics/[id]/subscribers      (list a topic's memberships)
 *
 * All DB access (createSubscriberTopicRepository) and auth are mocked — no real
 * DB or network calls (CI has no DATABASE_URL).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { SubscriberTopic, SubscriberTopicRepository } from '@digest/db';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@digest/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@digest/db')>();
  return {
    ...actual,
    createSubscriberTopicRepository: vi.fn(),
    getDefaultTopicId: vi.fn().mockResolvedValue('topic-1'),
    prisma: actual.prisma,
  };
});

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'admin-1', email: 'admin@test.com' } }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeMembership = (overrides: Partial<SubscriberTopic> = {}): SubscriberTopic => ({
  id: 'st-1',
  subscriberId: 'sub-1',
  topicId: 'topic-1',
  status: 'active',
  unsubscribeToken: 'tok-1',
  confirmToken: null,
  consentBasis: null,
  consentAt: null,
  consentSource: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

const makeRepo = (
  overrides: Partial<SubscriberTopicRepository> = {},
): SubscriberTopicRepository => ({
  findBySubscriberId: vi.fn().mockResolvedValue([makeMembership()]),
  findByTopicId: vi.fn().mockResolvedValue([makeMembership()]),
  findActiveRecipients: vi.fn().mockResolvedValue([]),
  countByTopicId: vi.fn().mockResolvedValue(1),
  upsert: vi.fn().mockResolvedValue(makeMembership()),
  setStatus: vi.fn().mockResolvedValue(makeMembership()),
  findByUnsubscribeToken: vi.fn().mockResolvedValue(null),
  findPendingByConfirmToken: vi.fn().mockResolvedValue(null),
  confirmMembership: vi.fn().mockResolvedValue(null),
  delete: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

function makeRequest(method: string, path: string, body?: unknown, origin?: string): NextRequest {
  const url = `http://localhost:3100${path}`;
  const headers = new Headers({ 'content-type': 'application/json' });
  if (origin !== undefined) headers.set('origin', origin);
  return new NextRequest(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function setupMocks(repoOverrides: Partial<SubscriberTopicRepository> = {}) {
  const { createSubscriberTopicRepository } = await import('@digest/db');
  const repo = makeRepo(repoOverrides);
  vi.mocked(createSubscriberTopicRepository).mockReturnValue(repo);
  return { repo };
}

// ===========================================================================
// GET /api/subscribers/[id]/topics
// ===========================================================================

describe('GET /api/subscribers/[id]/topics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with the subscriber memberships', async () => {
    const { repo } = await setupMocks();
    const { GET } = await import('../app/api/subscribers/[id]/topics/route');
    const res = await GET(makeRequest('GET', '/api/subscribers/sub-1/topics'), {
      params: Promise.resolve({ id: 'sub-1' }),
    });
    const body = (await res.json()) as { success: boolean; data: SubscriberTopic[] };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(repo.findBySubscriberId)).toHaveBeenCalledWith('sub-1');
  });

  it('returns 500 when the repository throws', async () => {
    const { repo } = await setupMocks();
    vi.mocked(repo.findBySubscriberId).mockRejectedValue(new Error('DB down'));
    const { GET } = await import('../app/api/subscribers/[id]/topics/route');
    const res = await GET(makeRequest('GET', '/api/subscribers/sub-1/topics'), {
      params: Promise.resolve({ id: 'sub-1' }),
    });
    expect(res.status).toBe(500);
  });
});

// ===========================================================================
// PUT /api/subscribers/[id]/topics
// ===========================================================================

describe('PUT /api/subscribers/[id]/topics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adds a membership via upsert', async () => {
    const { repo } = await setupMocks();
    const { PUT } = await import('../app/api/subscribers/[id]/topics/route');
    const res = await PUT(
      makeRequest('PUT', '/api/subscribers/sub-1/topics', { topicId: 'topic-2', action: 'add' }),
      { params: Promise.resolve({ id: 'sub-1' }) },
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(repo.upsert)).toHaveBeenCalledWith({
      subscriberId: 'sub-1',
      topicId: 'topic-2',
      status: 'active',
    });
    expect(vi.mocked(repo.delete)).not.toHaveBeenCalled();
  });

  it('removes a membership via delete', async () => {
    const { repo } = await setupMocks();
    const { PUT } = await import('../app/api/subscribers/[id]/topics/route');
    const res = await PUT(
      makeRequest('PUT', '/api/subscribers/sub-1/topics', { topicId: 'topic-2', action: 'remove' }),
      { params: Promise.resolve({ id: 'sub-1' }) },
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(repo.delete)).toHaveBeenCalledWith('sub-1', 'topic-2');
    expect(vi.mocked(repo.upsert)).not.toHaveBeenCalled();
  });

  it('rejects an invalid action → 400', async () => {
    await setupMocks();
    const { PUT } = await import('../app/api/subscribers/[id]/topics/route');
    const res = await PUT(
      makeRequest('PUT', '/api/subscribers/sub-1/topics', { topicId: 'topic-2', action: 'nope' }),
      { params: Promise.resolve({ id: 'sub-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('rejects a missing topicId → 400', async () => {
    await setupMocks();
    const { PUT } = await import('../app/api/subscribers/[id]/topics/route');
    const res = await PUT(
      makeRequest('PUT', '/api/subscribers/sub-1/topics', { action: 'add' }),
      { params: Promise.resolve({ id: 'sub-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('blocks cross-origin requests → 403', async () => {
    await setupMocks();
    const { PUT } = await import('../app/api/subscribers/[id]/topics/route');
    const res = await PUT(
      makeRequest(
        'PUT',
        '/api/subscribers/sub-1/topics',
        { topicId: 'topic-2', action: 'add' },
        'https://evil.com',
      ),
      { params: Promise.resolve({ id: 'sub-1' }) },
    );
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// GET /api/topics/[id]/subscribers
// ===========================================================================

describe('GET /api/topics/[id]/subscribers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with memberships and a total count', async () => {
    const { repo } = await setupMocks();
    vi.mocked(repo.findByTopicId).mockResolvedValue([
      makeMembership({ id: 'st-1', subscriberId: 'sub-1' }),
      makeMembership({ id: 'st-2', subscriberId: 'sub-2' }),
    ]);
    vi.mocked(repo.countByTopicId).mockResolvedValue(2);

    const { GET } = await import('../app/api/topics/[id]/subscribers/route');
    const res = await GET(makeRequest('GET', '/api/topics/topic-1/subscribers'), {
      params: Promise.resolve({ id: 'topic-1' }),
    });
    const body = (await res.json()) as {
      success: boolean;
      data: SubscriberTopic[];
      meta?: { total: number };
    };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.meta?.total).toBe(2);
    expect(vi.mocked(repo.findByTopicId)).toHaveBeenCalledWith('topic-1');
  });

  it('returns 500 when the repository throws', async () => {
    const { repo } = await setupMocks();
    vi.mocked(repo.findByTopicId).mockRejectedValue(new Error('DB down'));
    const { GET } = await import('../app/api/topics/[id]/subscribers/route');
    const res = await GET(makeRequest('GET', '/api/topics/topic-1/subscribers'), {
      params: Promise.resolve({ id: 'topic-1' }),
    });
    expect(res.status).toBe(500);
  });
});
