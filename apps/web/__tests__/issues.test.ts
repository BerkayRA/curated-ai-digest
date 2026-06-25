/**
 * Issues API route tests — covers:
 *   POST /api/issues  (create draft)
 *
 * Verifies that:
 *   - a draft carrying a `topicSlug` resolves and still returns success
 *   - cross-origin POST is rejected with 403 (same-origin CSRF guard)
 *
 * All external dependencies (prisma, topic resolution, auth) are mocked —
 * no real DB or network calls (CI has no DATABASE_URL).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Module mocks — declared before any import of the route under test.
// ---------------------------------------------------------------------------

// Mock @digest/db — prisma surface used by the issues POST handler, plus the
// topic resolution helpers. createTopicRepository(...).findBySlug → null forces
// resolve-topic.ts to fall back to the default topic, keeping the test DB-free
// regardless of the `topicSlug` input.
vi.mock('@digest/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@digest/db')>();
  return {
    ...actual,
    getDefaultTopicId: vi.fn().mockResolvedValue('topic-1'),
    getDefaultTopic: vi.fn().mockResolvedValue({ id: 'topic-1', slug: 'enterprise-ai' }),
    createTopicRepository: vi.fn().mockReturnValue({
      findBySlug: vi.fn().mockResolvedValue(null),
    }),
    prisma: {
      issue: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'issue-1' }),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
        fn({
          issue: { create: vi.fn().mockResolvedValue({ id: 'issue-1' }) },
        }),
      ),
    },
  };
});

// Mock auth so route handlers never hit a real session store.
vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'admin-1', email: 'admin@test.com' } }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  method: string,
  path: string,
  body?: unknown,
  origin?: string,
): NextRequest {
  const url = `http://localhost:3100${path}`;
  const headers = new Headers({ 'content-type': 'application/json' });
  if (origin !== undefined) {
    headers.set('origin', origin);
  }
  return new NextRequest(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const validDraft = {
  isoWeek: '2026-W24',
  subject: 'Bu hafta yapay zekâ',
  items: [
    {
      titleTr: 'Yeni model duyuruldu',
      summaryTr: 'Bu hafta öne çıkan gelişme.',
      sourceUrl: 'https://example.com/haber',
      sourceName: 'Example',
    },
  ],
};

// ===========================================================================
// POST /api/issues
// ===========================================================================

describe('POST /api/issues', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a draft carrying a topicSlug → 201', async () => {
    const { POST } = await import('../app/api/issues/route');
    const req = makeRequest('POST', '/api/issues', {
      ...validDraft,
      topicSlug: 'edge-ai',
    });
    const res = await POST(req);
    const body = (await res.json()) as { success: boolean; data: { id: string } };

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('issue-1');
  });

  it('creates a draft without a topicSlug (default topic) → 201', async () => {
    const { POST } = await import('../app/api/issues/route');
    const req = makeRequest('POST', '/api/issues', validDraft);
    const res = await POST(req);
    const body = (await res.json()) as { success: boolean };

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });

  it('blocks cross-origin requests → 403', async () => {
    const { POST } = await import('../app/api/issues/route');
    const req = makeRequest('POST', '/api/issues', validDraft, 'https://evil.com');
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
