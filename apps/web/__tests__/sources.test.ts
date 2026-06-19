/**
 * Sources API tests — covers:
 *   GET  /api/sources               (list)
 *   POST /api/sources               (create)
 *   GET  /api/sources/[id]          (get one)
 *   PATCH /api/sources/[id]         (update/toggle)
 *   DELETE /api/sources/[id]        (delete)
 *   POST /api/sources/[id]/test     (isolated test-fetch, no persist)
 *   POST /api/sources/run           (run ingest now)
 *
 * All external dependencies (SourceRepository, curation factories,
 * runIngestFromDb, auth) are mocked — no real DB or network calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { Source } from '@digest/db';
import type { SourceRepository } from '@digest/db';

// ---------------------------------------------------------------------------
// Module mocks — declared before any import of the route under test.
// ---------------------------------------------------------------------------

// Mock @digest/db createSourceRepository
vi.mock('@digest/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@digest/db')>();
  return {
    ...actual,
    createSourceRepository: vi.fn(),
    prisma: actual.prisma,
  };
});

// Mock @digest/curation — factories and runIngestFromDb
vi.mock('@digest/curation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@digest/curation')>();
  return {
    ...actual,
    createRssProvider: vi.fn(),
    createExaProvider: vi.fn(),
    createRadarProvider: vi.fn(),
    runIngestFromDb: vi.fn(),
    DEFAULT_TOPIC: actual.DEFAULT_TOPIC,
  };
});

// Mock auth so route handlers never hit a real session store
vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'admin-1', email: 'admin@test.com' } }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeSource = (overrides: Partial<Source> = {}): Source => ({
  id: 'src-1',
  type: 'rss',
  label: 'Test RSS',
  url: 'https://example.com/feed.xml',
  enabled: true,
  config: null,
  lastRunAt: null,
  lastStatus: null,
  lastCount: 0,
  lastError: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

const makeRepo = (overrides: Partial<SourceRepository> = {}): SourceRepository => ({
  findAll: vi.fn().mockResolvedValue([makeSource()]),
  findEnabled: vi.fn().mockResolvedValue([makeSource()]),
  findById: vi.fn().mockResolvedValue(makeSource()),
  create: vi.fn().mockResolvedValue(makeSource()),
  update: vi.fn().mockResolvedValue(makeSource()),
  delete: vi.fn().mockResolvedValue(makeSource()),
  recordHealth: vi.fn().mockResolvedValue(makeSource()),
  ...overrides,
});

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

// ---------------------------------------------------------------------------
// Helper to wire createSourceRepository mock before each test
// ---------------------------------------------------------------------------

async function setupMocks(repoOverrides: Partial<SourceRepository> = {}) {
  const { createSourceRepository } = await import('@digest/db');
  const repo = makeRepo(repoOverrides);
  vi.mocked(createSourceRepository).mockReturnValue(repo);
  return { repo };
}

// ===========================================================================
// GET /api/sources
// ===========================================================================

describe('GET /api/sources', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with list of sources', async () => {
    const { repo } = await setupMocks();
    const source1 = makeSource({ id: 'src-1' });
    const source2 = makeSource({ id: 'src-2', label: 'Second' });
    vi.mocked(repo.findAll).mockResolvedValue([source1, source2]);

    const { GET } = await import('../app/api/sources/route');
    const req = makeRequest('GET', '/api/sources');
    const res = await GET(req);
    const body = (await res.json()) as { success: boolean; data: Source[] };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]?.id).toBe('src-1');
  });

  it('returns 200 with empty array when no sources exist', async () => {
    const { repo } = await setupMocks();
    vi.mocked(repo.findAll).mockResolvedValue([]);

    const { GET } = await import('../app/api/sources/route');
    const req = makeRequest('GET', '/api/sources');
    const res = await GET(req);
    const body = (await res.json()) as { success: boolean; data: Source[] };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(0);
  });

  it('returns 500 when repository throws', async () => {
    const { repo } = await setupMocks();
    vi.mocked(repo.findAll).mockRejectedValue(new Error('DB connection failed'));

    const { GET } = await import('../app/api/sources/route');
    const req = makeRequest('GET', '/api/sources');
    const res = await GET(req);
    const body = (await res.json()) as { success: boolean; error: string };

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toContain('DB connection failed');
  });
});

// ===========================================================================
// POST /api/sources — validation
// ===========================================================================

describe('POST /api/sources — validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects body with invalid type → 400', async () => {
    await setupMocks();
    const { POST } = await import('../app/api/sources/route');
    const req = makeRequest('POST', '/api/sources', {
      type: 'unknown-type',
      label: 'Test',
      url: 'https://example.com/feed.xml',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(false);
  });

  it('rejects rss source without url → 400', async () => {
    await setupMocks();
    const { POST } = await import('../app/api/sources/route');
    const req = makeRequest('POST', '/api/sources', {
      type: 'rss',
      label: 'My RSS',
      // url intentionally omitted
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(false);
  });

  it('rejects rss source with invalid url → 400', async () => {
    await setupMocks();
    const { POST } = await import('../app/api/sources/route');
    const req = makeRequest('POST', '/api/sources', {
      type: 'rss',
      label: 'My RSS',
      url: 'not-a-valid-url',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(false);
  });

  it('rejects body with missing label → 400', async () => {
    await setupMocks();
    const { POST } = await import('../app/api/sources/route');
    const req = makeRequest('POST', '/api/sources', {
      type: 'rss',
      url: 'https://example.com/feed.xml',
      // label omitted
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(false);
  });

  it('rejects radar source without url → 400', async () => {
    await setupMocks();
    const { POST } = await import('../app/api/sources/route');
    const req = makeRequest('POST', '/api/sources', {
      type: 'radar',
      label: 'Radar',
      // url omitted
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(false);
  });

  it('accepts valid rss source → 201 with created source', async () => {
    const { repo } = await setupMocks();
    const created = makeSource({ id: 'new-src', label: 'My RSS' });
    vi.mocked(repo.create).mockResolvedValue(created);

    const { POST } = await import('../app/api/sources/route');
    const req = makeRequest('POST', '/api/sources', {
      type: 'rss',
      label: 'My RSS',
      url: 'https://example.com/feed.xml',
    });
    const res = await POST(req);
    const body = (await res.json()) as { success: boolean; data: Source };

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('new-src');
  });

  it('accepts valid exa source without url → 201', async () => {
    const { repo } = await setupMocks();
    const created = makeSource({ id: 'exa-src', type: 'exa', url: null });
    vi.mocked(repo.create).mockResolvedValue(created);

    const { POST } = await import('../app/api/sources/route');
    const req = makeRequest('POST', '/api/sources', {
      type: 'exa',
      label: 'Exa Source',
    });
    const res = await POST(req);
    const body = (await res.json()) as { success: boolean; data: Source };

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });

  it('accepts valid radar source with url → 201', async () => {
    const { repo } = await setupMocks();
    const created = makeSource({ id: 'radar-src', type: 'radar' });
    vi.mocked(repo.create).mockResolvedValue(created);

    const { POST } = await import('../app/api/sources/route');
    const req = makeRequest('POST', '/api/sources', {
      type: 'radar',
      label: 'Radar Feed',
      url: 'https://raw.githubusercontent.com/org/repo/main/data/history.jsonl',
    });
    const res = await POST(req);
    const body = (await res.json()) as { success: boolean; data: Source };

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });

  it('rejects empty body → 400', async () => {
    await setupMocks();
    const { POST } = await import('../app/api/sources/route');
    // Send completely empty JSON object
    const req = makeRequest('POST', '/api/sources', {});
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 500 when repository.create throws', async () => {
    const { repo } = await setupMocks();
    vi.mocked(repo.create).mockRejectedValue(new Error('Unique constraint failed'));

    const { POST } = await import('../app/api/sources/route');
    const req = makeRequest('POST', '/api/sources', {
      type: 'rss',
      label: 'My RSS',
      url: 'https://example.com/feed.xml',
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
  });
});

// ===========================================================================
// GET /api/sources/[id]
// ===========================================================================

describe('GET /api/sources/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with source when found', async () => {
    const { repo } = await setupMocks();
    const source = makeSource({ id: 'src-abc' });
    vi.mocked(repo.findById).mockResolvedValue(source);

    const { GET } = await import('../app/api/sources/[id]/route');
    const req = makeRequest('GET', '/api/sources/src-abc');
    const res = await GET(req, { params: { id: 'src-abc' } });
    const body = (await res.json()) as { success: boolean; data: Source };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('src-abc');
  });

  it('returns 404 when source not found', async () => {
    const { repo } = await setupMocks();
    vi.mocked(repo.findById).mockResolvedValue(null);

    const { GET } = await import('../app/api/sources/[id]/route');
    const req = makeRequest('GET', '/api/sources/missing');
    const res = await GET(req, { params: { id: 'missing' } });
    const body = (await res.json()) as { success: boolean; error: string };

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });
});

// ===========================================================================
// PATCH /api/sources/[id]
// ===========================================================================

describe('PATCH /api/sources/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates source and returns 200', async () => {
    const { repo } = await setupMocks();
    const updated = makeSource({ enabled: false });
    vi.mocked(repo.findById).mockResolvedValue(makeSource());
    vi.mocked(repo.update).mockResolvedValue(updated);

    const { PATCH } = await import('../app/api/sources/[id]/route');
    const req = makeRequest('PATCH', '/api/sources/src-1', { enabled: false });
    const res = await PATCH(req, { params: { id: 'src-1' } });
    const body = (await res.json()) as { success: boolean; data: Source };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.enabled).toBe(false);
  });

  it('rejects invalid body → 400', async () => {
    await setupMocks();
    const { PATCH } = await import('../app/api/sources/[id]/route');
    const req = makeRequest('PATCH', '/api/sources/src-1', {
      url: 'not-a-url',
    });
    const res = await PATCH(req, { params: { id: 'src-1' } });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(false);
  });

  it('returns 404 when source not found', async () => {
    const { repo } = await setupMocks();
    vi.mocked(repo.findById).mockResolvedValue(null);

    const { PATCH } = await import('../app/api/sources/[id]/route');
    const req = makeRequest('PATCH', '/api/sources/missing', { enabled: false });
    const res = await PATCH(req, { params: { id: 'missing' } });
    expect(res.status).toBe(404);
  });

  it('blocks cross-origin requests → 403', async () => {
    await setupMocks();
    const { PATCH } = await import('../app/api/sources/[id]/route');
    const req = makeRequest('PATCH', '/api/sources/src-1', { enabled: false }, 'https://evil.com');
    const res = await PATCH(req, { params: { id: 'src-1' } });
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// DELETE /api/sources/[id]
// ===========================================================================

describe('DELETE /api/sources/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes source and returns 200', async () => {
    const { repo } = await setupMocks();
    const deleted = makeSource({ id: 'src-1' });
    vi.mocked(repo.findById).mockResolvedValue(makeSource());
    vi.mocked(repo.delete).mockResolvedValue(deleted);

    const { DELETE } = await import('../app/api/sources/[id]/route');
    const req = makeRequest('DELETE', '/api/sources/src-1');
    const res = await DELETE(req, { params: { id: 'src-1' } });
    const body = (await res.json()) as { success: boolean; data: Source };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 404 when source not found', async () => {
    const { repo } = await setupMocks();
    vi.mocked(repo.findById).mockResolvedValue(null);

    const { DELETE } = await import('../app/api/sources/[id]/route');
    const req = makeRequest('DELETE', '/api/sources/missing');
    const res = await DELETE(req, { params: { id: 'missing' } });
    expect(res.status).toBe(404);
  });

  it('blocks cross-origin requests → 403', async () => {
    await setupMocks();
    const { DELETE } = await import('../app/api/sources/[id]/route');
    const req = makeRequest('DELETE', '/api/sources/src-1', undefined, 'https://evil.com');
    const res = await DELETE(req, { params: { id: 'src-1' } });
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// POST /api/sources/[id]/test — isolated test-fetch
// ===========================================================================

describe('POST /api/sources/[id]/test', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns count and sample without persisting (rss)', async () => {
    const { repo } = await setupMocks();
    const rssSource = makeSource({ id: 'src-rss', type: 'rss', url: 'https://example.com/feed.xml' });
    vi.mocked(repo.findById).mockResolvedValue(rssSource);

    const { createRssProvider } = await import('@digest/curation');
    const mockFetch = vi.fn().mockResolvedValue({
      candidates: [
        { title: 'Article 1', sourceUrl: 'https://example.com/1', sourceName: 'Test', rawExcerpt: 'x', publishedAt: undefined },
        { title: 'Article 2', sourceUrl: 'https://example.com/2', sourceName: 'Test', rawExcerpt: 'y', publishedAt: undefined },
      ],
      errors: [],
    });
    vi.mocked(createRssProvider).mockReturnValue({
      id: 'rss:src-rss',
      label: 'RSS Feeds',
      fetch: mockFetch,
    });

    const { POST } = await import('../app/api/sources/[id]/test/route');
    const req = makeRequest('POST', '/api/sources/src-rss/test');
    const res = await POST(req, { params: { id: 'src-rss' } });
    const body = (await res.json()) as {
      success: boolean;
      data: { ok: boolean; count: number; sample: Array<{ title: string; sourceUrl: string }>; errors: unknown[] };
    };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.ok).toBe(true);
    expect(body.data.count).toBe(2);
    expect(body.data.sample).toHaveLength(2);
    expect(body.data.sample[0]?.title).toBe('Article 1');
    expect(body.data.errors).toHaveLength(0);
  });

  it('returns count and sample for exa source', async () => {
    const { repo } = await setupMocks();
    const exaSource = makeSource({ id: 'src-exa', type: 'exa', url: null });
    vi.mocked(repo.findById).mockResolvedValue(exaSource);

    const { createExaProvider } = await import('@digest/curation');
    const mockFetch = vi.fn().mockResolvedValue({
      candidates: [
        { title: 'Exa Article 1', sourceUrl: 'https://exa.com/1', sourceName: 'Exa', rawExcerpt: undefined, publishedAt: undefined },
      ],
      errors: [],
    });
    vi.mocked(createExaProvider).mockReturnValue({
      id: 'exa:src-exa',
      label: 'Exa Neural Search',
      fetch: mockFetch,
    });

    const { POST } = await import('../app/api/sources/[id]/test/route');
    const req = makeRequest('POST', '/api/sources/src-exa/test');
    const res = await POST(req, { params: { id: 'src-exa' } });
    const body = (await res.json()) as {
      success: boolean;
      data: { ok: boolean; count: number; sample: Array<{ title: string; sourceUrl: string }>; errors: unknown[] };
    };

    expect(res.status).toBe(200);
    expect(body.data.ok).toBe(true);
    expect(body.data.count).toBe(1);
  });

  it('returns count and sample for radar source', async () => {
    const { repo } = await setupMocks();
    const radarSource = makeSource({
      id: 'src-radar',
      type: 'radar',
      url: 'https://raw.githubusercontent.com/org/repo/main/data/history.jsonl',
    });
    vi.mocked(repo.findById).mockResolvedValue(radarSource);

    const { createRadarProvider } = await import('@digest/curation');
    const mockFetch = vi.fn().mockResolvedValue({
      candidates: [
        { title: 'Radar Item', sourceUrl: 'https://radar.com/p1', sourceName: 'Radar', rawExcerpt: 'some reason', publishedAt: undefined },
      ],
      errors: [],
    });
    vi.mocked(createRadarProvider).mockReturnValue({
      id: 'radar:src-radar',
      label: 'Radar',
      fetch: mockFetch,
    });

    const { POST } = await import('../app/api/sources/[id]/test/route');
    const req = makeRequest('POST', '/api/sources/src-radar/test');
    const res = await POST(req, { params: { id: 'src-radar' } });
    const body = (await res.json()) as {
      success: boolean;
      data: { ok: boolean; count: number; sample: unknown[]; errors: unknown[] };
    };

    expect(res.status).toBe(200);
    expect(body.data.count).toBe(1);
  });

  it('does NOT call repo.create or repo.update (no persist)', async () => {
    const { repo } = await setupMocks();
    const rssSource = makeSource({ id: 'src-rss', type: 'rss', url: 'https://example.com/feed.xml' });
    vi.mocked(repo.findById).mockResolvedValue(rssSource);

    const { createRssProvider } = await import('@digest/curation');
    vi.mocked(createRssProvider).mockReturnValue({
      id: 'rss:src-rss',
      label: 'RSS Feeds',
      fetch: vi.fn().mockResolvedValue({ candidates: [], errors: [] }),
    });

    const { POST } = await import('../app/api/sources/[id]/test/route');
    const req = makeRequest('POST', '/api/sources/src-rss/test');
    await POST(req, { params: { id: 'src-rss' } });

    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.recordHealth).not.toHaveBeenCalled();
  });

  it('returns ok:false with errors in payload when provider fetch throws (no 500)', async () => {
    const { repo } = await setupMocks();
    const rssSource = makeSource({ id: 'src-rss', type: 'rss', url: 'https://example.com/feed.xml' });
    vi.mocked(repo.findById).mockResolvedValue(rssSource);

    const { createRssProvider } = await import('@digest/curation');
    vi.mocked(createRssProvider).mockReturnValue({
      id: 'rss:src-rss',
      label: 'RSS Feeds',
      fetch: vi.fn().mockRejectedValue(new Error('Network timeout')),
    });

    const { POST } = await import('../app/api/sources/[id]/test/route');
    const req = makeRequest('POST', '/api/sources/src-rss/test');
    const res = await POST(req, { params: { id: 'src-rss' } });
    const body = (await res.json()) as {
      success: boolean;
      data: { ok: boolean; count: number; errors: unknown[] };
    };

    // Network/provider errors must NOT produce a 500 — return in payload
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.ok).toBe(false);
    expect(body.data.count).toBe(0);
    expect(body.data.errors.length).toBeGreaterThan(0);
  });

  it('returns sample capped at 5 even when more candidates exist', async () => {
    const { repo } = await setupMocks();
    const rssSource = makeSource({ id: 'src-rss', type: 'rss', url: 'https://example.com/feed.xml' });
    vi.mocked(repo.findById).mockResolvedValue(rssSource);

    const { createRssProvider } = await import('@digest/curation');
    const manyCandidates = Array.from({ length: 10 }, (_, i) => ({
      title: `Article ${i + 1}`,
      sourceUrl: `https://example.com/${i + 1}`,
      sourceName: 'Test',
      rawExcerpt: undefined,
      publishedAt: undefined,
    }));
    vi.mocked(createRssProvider).mockReturnValue({
      id: 'rss:src-rss',
      label: 'RSS Feeds',
      fetch: vi.fn().mockResolvedValue({ candidates: manyCandidates, errors: [] }),
    });

    const { POST } = await import('../app/api/sources/[id]/test/route');
    const req = makeRequest('POST', '/api/sources/src-rss/test');
    const res = await POST(req, { params: { id: 'src-rss' } });
    const body = (await res.json()) as {
      success: boolean;
      data: { ok: boolean; count: number; sample: unknown[] };
    };

    expect(body.data.count).toBe(10); // total
    expect(body.data.sample).toHaveLength(5); // capped at 5
  });

  it('returns 404 when source not found', async () => {
    const { repo } = await setupMocks();
    vi.mocked(repo.findById).mockResolvedValue(null);

    const { POST } = await import('../app/api/sources/[id]/test/route');
    const req = makeRequest('POST', '/api/sources/missing/test');
    const res = await POST(req, { params: { id: 'missing' } });
    expect(res.status).toBe(404);
  });

  it('blocks cross-origin requests → 403', async () => {
    await setupMocks();
    const { POST } = await import('../app/api/sources/[id]/test/route');
    const req = makeRequest('POST', '/api/sources/src-1/test', undefined, 'https://evil.com');
    const res = await POST(req, { params: { id: 'src-1' } });
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// POST /api/sources/run — run ingest now
// ===========================================================================

describe('POST /api/sources/run', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls runIngestFromDb and returns summary', async () => {
    const { runIngestFromDb } = await import('@digest/curation');
    vi.mocked(runIngestFromDb).mockResolvedValue({
      ingestRunId: 'run-1',
      fetched: 42,
      persisted: 15,
      deduped: 30,
      errors: [],
      bySource: { rss: 30, exa: 12 },
    });

    const { POST } = await import('../app/api/sources/run/route');
    const req = makeRequest('POST', '/api/sources/run');
    const res = await POST(req);
    const body = (await res.json()) as {
      success: boolean;
      data: { fetched: number; persisted: number; deduped: number; errors: unknown[]; bySource: Record<string, number> };
    };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.fetched).toBe(42);
    expect(body.data.persisted).toBe(15);
    expect(body.data.deduped).toBe(30);
    expect(body.data.errors).toHaveLength(0);
    expect(body.data.bySource).toEqual({ rss: 30, exa: 12 });
  });

  it('passes a logger to runIngestFromDb', async () => {
    const { runIngestFromDb } = await import('@digest/curation');
    vi.mocked(runIngestFromDb).mockResolvedValue({
      ingestRunId: 'run-2',
      fetched: 0,
      persisted: 0,
      deduped: 0,
      errors: [],
    });

    const { POST } = await import('../app/api/sources/run/route');
    const req = makeRequest('POST', '/api/sources/run');
    await POST(req);

    expect(runIngestFromDb).toHaveBeenCalledWith(
      expect.objectContaining({ logger: expect.objectContaining({ info: expect.any(Function) }) }),
    );
  });

  it('returns errors from the ingest result in summary', async () => {
    const { runIngestFromDb } = await import('@digest/curation');
    vi.mocked(runIngestFromDb).mockResolvedValue({
      ingestRunId: 'run-3',
      fetched: 5,
      persisted: 5,
      deduped: 5,
      errors: [{ source: 'rss', message: 'Feed unreachable' }],
    });

    const { POST } = await import('../app/api/sources/run/route');
    const req = makeRequest('POST', '/api/sources/run');
    const res = await POST(req);
    const body = (await res.json()) as {
      success: boolean;
      data: { errors: Array<{ source: string; message: string }> };
    };

    expect(body.data.errors).toHaveLength(1);
    expect(body.data.errors[0]?.source).toBe('rss');
  });

  it('returns 500 when runIngestFromDb throws', async () => {
    const { runIngestFromDb } = await import('@digest/curation');
    vi.mocked(runIngestFromDb).mockRejectedValue(new Error('DB unavailable'));

    const { POST } = await import('../app/api/sources/run/route');
    const req = makeRequest('POST', '/api/sources/run');
    const res = await POST(req);
    const body = (await res.json()) as { success: boolean; error: string };

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toContain('DB unavailable');
  });

  it('blocks cross-origin requests → 403', async () => {
    const { POST } = await import('../app/api/sources/run/route');
    const req = makeRequest('POST', '/api/sources/run', undefined, 'https://evil.com');
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
