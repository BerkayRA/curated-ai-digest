/**
 * Topics API tests — covers:
 *   GET   /api/topics        (list)
 *   POST  /api/topics        (create + validation)
 *   GET   /api/topics/[id]   (get one)
 *   PATCH /api/topics/[id]   (update / pause / activate)
 *   DELETE /api/topics/[id]  (405 — topics are paused, not deleted)
 *
 * All DB access (createTopicRepository) and auth are mocked — no real DB or
 * network calls (CI has no DATABASE_URL).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { Topic, TopicRepository } from '@digest/db';

// ---------------------------------------------------------------------------
// Module mocks — declared before any import of the route under test.
// ---------------------------------------------------------------------------

vi.mock('@digest/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@digest/db')>();
  return {
    ...actual,
    createTopicRepository: vi.fn(),
    prisma: actual.prisma,
  };
});

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'admin-1', email: 'admin@test.com' } }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeTopic = (overrides: Partial<Topic> = {}): Topic => ({
  id: 'topic-1',
  slug: 'enterprise-ai',
  name: 'Kurumsal AI',
  description: null,
  audience: null,
  voice: null,
  status: 'active',
  consentMode: 'business',
  sendDayOfWeek: null,
  sendTime: null,
  timezone: null,
  pipelineLeadDays: null,
  autoSendEnabled: null,
  fromAddress: null,
  replyTo: null,
  brandLogoUrl: null,
  brandColorHex: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

const makeRepo = (overrides: Partial<TopicRepository> = {}): TopicRepository => ({
  findAll: vi.fn().mockResolvedValue([makeTopic()]),
  findActive: vi.fn().mockResolvedValue([makeTopic()]),
  findBySlug: vi.fn().mockResolvedValue(makeTopic()),
  findById: vi.fn().mockResolvedValue(makeTopic()),
  create: vi.fn().mockResolvedValue(makeTopic()),
  update: vi.fn().mockResolvedValue(makeTopic()),
  setStatus: vi.fn().mockResolvedValue(makeTopic()),
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

async function setupMocks(repoOverrides: Partial<TopicRepository> = {}) {
  const { createTopicRepository } = await import('@digest/db');
  const repo = makeRepo(repoOverrides);
  vi.mocked(createTopicRepository).mockReturnValue(repo);
  return { repo };
}

// ===========================================================================
// GET /api/topics
// ===========================================================================

describe('GET /api/topics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with list of topics', async () => {
    const { repo } = await setupMocks();
    vi.mocked(repo.findAll).mockResolvedValue([
      makeTopic({ id: 't1' }),
      makeTopic({ id: 't2', slug: 'edge-ai', name: 'Edge AI' }),
    ]);

    const { GET } = await import('../app/api/topics/route');
    const res = await GET(makeRequest('GET', '/api/topics'));
    const body = (await res.json()) as { success: boolean; data: Topic[] };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[1]?.slug).toBe('edge-ai');
  });

  it('returns 200 with empty array when no topics exist', async () => {
    const { repo } = await setupMocks();
    vi.mocked(repo.findAll).mockResolvedValue([]);

    const { GET } = await import('../app/api/topics/route');
    const res = await GET(makeRequest('GET', '/api/topics'));
    const body = (await res.json()) as { success: boolean; data: Topic[] };

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(0);
  });

  it('returns 500 when repository throws', async () => {
    const { repo } = await setupMocks();
    vi.mocked(repo.findAll).mockRejectedValue(new Error('DB connection failed'));

    const { GET } = await import('../app/api/topics/route');
    const res = await GET(makeRequest('GET', '/api/topics'));
    const body = (await res.json()) as { success: boolean; error: string };

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toContain('DB connection failed');
  });
});

// ===========================================================================
// POST /api/topics — validation
// ===========================================================================

describe('POST /api/topics — validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects slug with uppercase letters → 400', async () => {
    await setupMocks();
    const { POST } = await import('../app/api/topics/route');
    const res = await POST(makeRequest('POST', '/api/topics', { slug: 'Edge-AI', name: 'Edge AI' }));
    expect(res.status).toBe(400);
  });

  it('rejects slug with spaces → 400', async () => {
    await setupMocks();
    const { POST } = await import('../app/api/topics/route');
    const res = await POST(makeRequest('POST', '/api/topics', { slug: 'edge ai', name: 'Edge AI' }));
    expect(res.status).toBe(400);
  });

  it('rejects missing name → 400', async () => {
    await setupMocks();
    const { POST } = await import('../app/api/topics/route');
    const res = await POST(makeRequest('POST', '/api/topics', { slug: 'edge-ai' }));
    expect(res.status).toBe(400);
  });

  it('accepts valid payload → 201 with created topic', async () => {
    const { repo } = await setupMocks();
    const created = makeTopic({ id: 'new-topic', slug: 'edge-ai', name: 'Edge AI' });
    vi.mocked(repo.create).mockResolvedValue(created);

    const { POST } = await import('../app/api/topics/route');
    const res = await POST(
      makeRequest('POST', '/api/topics', {
        slug: 'edge-ai',
        name: 'Edge AI',
        description: 'Uçta yapay zeka',
        audience: 'Gömülü sistem geliştiricileri',
      }),
    );
    const body = (await res.json()) as { success: boolean; data: Topic };

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('new-topic');
    expect(vi.mocked(repo.create)).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'edge-ai', name: 'Edge AI', status: 'active' }),
    );
  });

  it('defaults status to active when omitted', async () => {
    const { repo } = await setupMocks();
    const { POST } = await import('../app/api/topics/route');
    await POST(makeRequest('POST', '/api/topics', { slug: 'edge-ai', name: 'Edge AI' }));
    expect(vi.mocked(repo.create)).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
    );
  });

  it('returns 500 when repository.create throws', async () => {
    const { repo } = await setupMocks();
    vi.mocked(repo.create).mockRejectedValue(new Error('Unique constraint failed'));

    const { POST } = await import('../app/api/topics/route');
    const res = await POST(makeRequest('POST', '/api/topics', { slug: 'edge-ai', name: 'Edge AI' }));
    expect(res.status).toBe(500);
  });

  it('blocks cross-origin requests → 403', async () => {
    await setupMocks();
    const { POST } = await import('../app/api/topics/route');
    const res = await POST(
      makeRequest('POST', '/api/topics', { slug: 'edge-ai', name: 'Edge AI' }, 'https://evil.com'),
    );
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// GET /api/topics/[id]
// ===========================================================================

describe('GET /api/topics/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with topic when found', async () => {
    const { repo } = await setupMocks();
    vi.mocked(repo.findById).mockResolvedValue(makeTopic({ id: 'topic-abc' }));

    const { GET } = await import('../app/api/topics/[id]/route');
    const res = await GET(makeRequest('GET', '/api/topics/topic-abc'), { params: { id: 'topic-abc' } });
    const body = (await res.json()) as { success: boolean; data: Topic };

    expect(res.status).toBe(200);
    expect(body.data.id).toBe('topic-abc');
  });

  it('returns 404 when topic not found', async () => {
    const { repo } = await setupMocks();
    vi.mocked(repo.findById).mockResolvedValue(null);

    const { GET } = await import('../app/api/topics/[id]/route');
    const res = await GET(makeRequest('GET', '/api/topics/missing'), { params: { id: 'missing' } });
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// PATCH /api/topics/[id]
// ===========================================================================

describe('PATCH /api/topics/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates topic and returns 200', async () => {
    const { repo } = await setupMocks();
    vi.mocked(repo.findById).mockResolvedValue(makeTopic());
    vi.mocked(repo.update).mockResolvedValue(makeTopic({ name: 'Renamed' }));

    const { PATCH } = await import('../app/api/topics/[id]/route');
    const res = await PATCH(makeRequest('PATCH', '/api/topics/topic-1', { name: 'Renamed' }), {
      params: { id: 'topic-1' },
    });
    const body = (await res.json()) as { success: boolean; data: Topic };

    expect(res.status).toBe(200);
    expect(body.data.name).toBe('Renamed');
  });

  it('pauses a topic via status update', async () => {
    const { repo } = await setupMocks();
    vi.mocked(repo.findById).mockResolvedValue(makeTopic());
    vi.mocked(repo.update).mockResolvedValue(makeTopic({ status: 'paused' }));

    const { PATCH } = await import('../app/api/topics/[id]/route');
    const res = await PATCH(makeRequest('PATCH', '/api/topics/topic-1', { status: 'paused' }), {
      params: { id: 'topic-1' },
    });

    expect(res.status).toBe(200);
    expect(vi.mocked(repo.update)).toHaveBeenCalledWith('topic-1', { status: 'paused' });
  });

  it('rejects invalid slug → 400', async () => {
    await setupMocks();
    const { PATCH } = await import('../app/api/topics/[id]/route');
    const res = await PATCH(makeRequest('PATCH', '/api/topics/topic-1', { slug: 'Bad Slug' }), {
      params: { id: 'topic-1' },
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when topic not found', async () => {
    const { repo } = await setupMocks();
    vi.mocked(repo.findById).mockResolvedValue(null);

    const { PATCH } = await import('../app/api/topics/[id]/route');
    const res = await PATCH(makeRequest('PATCH', '/api/topics/missing', { name: 'X' }), {
      params: { id: 'missing' },
    });
    expect(res.status).toBe(404);
  });

  it('blocks cross-origin requests → 403', async () => {
    await setupMocks();
    const { PATCH } = await import('../app/api/topics/[id]/route');
    const res = await PATCH(
      makeRequest('PATCH', '/api/topics/topic-1', { name: 'X' }, 'https://evil.com'),
      { params: { id: 'topic-1' } },
    );
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// DELETE /api/topics/[id] — disallowed
// ===========================================================================

describe('DELETE /api/topics/[id]', () => {
  it('returns 405 (topics are paused, not deleted)', async () => {
    const { DELETE } = await import('../app/api/topics/[id]/route');
    const res = DELETE();
    expect(res.status).toBe(405);
  });
});
