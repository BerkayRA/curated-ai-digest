import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { Sponsor, SponsorRepository, SponsorAnalyticsRepository } from '@digest/db';

// ---------------------------------------------------------------------------
// Module mocks — declared before importing the routes under test.
// ---------------------------------------------------------------------------

vi.mock('@digest/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@digest/db')>();
  return {
    ...actual,
    createSponsorRepository: vi.fn(),
    createSponsorAnalyticsRepository: vi.fn(),
    prisma: actual.prisma,
  };
});

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'admin-1', email: 'admin@test.com' } }),
}));

import { GET as listSponsors, POST as createSponsor } from '@/app/api/sponsors/route';
import { PATCH as patchSponsor, DELETE as deleteSponsor } from '@/app/api/sponsors/[id]/route';
import { GET as sponsorAnalytics } from '@/app/api/sponsors/[id]/analytics/route';

const ORIGIN = 'http://localhost:3100';

const makeSponsor = (overrides: Partial<Sponsor> = {}): Sponsor => ({
  id: 'sp-1',
  name: 'Acme Cloud',
  websiteUrl: 'https://acme.example.com',
  logoUrl: null,
  contactEmail: null,
  notes: null,
  active: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

const makeRepo = (overrides: Partial<SponsorRepository> = {}): SponsorRepository => ({
  findAll: vi.fn().mockResolvedValue([makeSponsor()]),
  findActive: vi.fn().mockResolvedValue([makeSponsor()]),
  findById: vi.fn().mockResolvedValue(makeSponsor()),
  create: vi.fn().mockResolvedValue(makeSponsor()),
  update: vi.fn().mockResolvedValue(makeSponsor()),
  setActive: vi.fn().mockResolvedValue(makeSponsor()),
  ...overrides,
});

function makeRequest(method: string, path: string, body?: unknown, origin?: string): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (origin !== undefined) headers.set('origin', origin);
  return new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function setupRepo(overrides: Partial<SponsorRepository> = {}) {
  const { createSponsorRepository } = await import('@digest/db');
  const repo = makeRepo(overrides);
  vi.mocked(createSponsorRepository).mockReturnValue(repo);
  return repo;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// GET /api/sponsors
// ===========================================================================

describe('GET /api/sponsors', () => {
  it('returns active sponsors', async () => {
    await setupRepo();
    const res = await listSponsors(makeRequest('GET', '/api/sponsors'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].name).toBe('Acme Cloud');
  });
});

// ===========================================================================
// POST /api/sponsors
// ===========================================================================

describe('POST /api/sponsors', () => {
  it('creates a sponsor with valid https URLs', async () => {
    const repo = await setupRepo();
    const res = await createSponsor(
      makeRequest(
        'POST',
        '/api/sponsors',
        { name: 'Acme', websiteUrl: 'https://acme.example.com' },
        ORIGIN,
      ),
    );
    expect(res.status).toBe(201);
    expect(vi.mocked(repo.create)).toHaveBeenCalledOnce();
  });

  it('rejects a non-https website URL (400)', async () => {
    await setupRepo();
    const res = await createSponsor(
      makeRequest(
        'POST',
        '/api/sponsors',
        { name: 'Acme', websiteUrl: 'http://acme.example.com' },
        ORIGIN,
      ),
    );
    expect(res.status).toBe(400);
  });

  it('rejects a missing name (400)', async () => {
    await setupRepo();
    const res = await createSponsor(
      makeRequest('POST', '/api/sponsors', { websiteUrl: 'https://acme.example.com' }, ORIGIN),
    );
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// PATCH /api/sponsors/[id]
// ===========================================================================

describe('PATCH /api/sponsors/[id]', () => {
  it('updates a sponsor', async () => {
    const repo = await setupRepo();
    const res = await patchSponsor(
      makeRequest('PATCH', '/api/sponsors/sp-1', { active: false }, ORIGIN),
      { params: Promise.resolve({ id: 'sp-1' }) },
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(repo.update)).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// DELETE /api/sponsors/[id] → 405
// ===========================================================================

describe('DELETE /api/sponsors/[id]', () => {
  it('returns 405 (sponsors are deactivated, not deleted)', async () => {
    const res = deleteSponsor();
    expect(res.status).toBe(405);
  });
});

// ===========================================================================
// GET /api/sponsors/[id]/analytics
// ===========================================================================

describe('GET /api/sponsors/[id]/analytics', () => {
  function setupAnalytics(over: Partial<SponsorAnalyticsRepository> = {}) {
    const analytics: SponsorAnalyticsRepository = {
      getSponsorClicksByIssue: vi
        .fn()
        .mockResolvedValue([
          { issueId: 'i-1', isoWeek: '2026-W25', subject: 'S', sentAt: null, clicks: 5 },
        ]),
      getTotalSponsorClicks: vi.fn().mockResolvedValue(5),
      ...over,
    };
    return analytics;
  }

  it('returns total clicks + per-issue breakdown for a known sponsor', async () => {
    await setupRepo();
    const { createSponsorAnalyticsRepository } = await import('@digest/db');
    vi.mocked(createSponsorAnalyticsRepository).mockReturnValue(setupAnalytics());

    const res = await sponsorAnalytics(makeRequest('GET', '/api/sponsors/sp-1/analytics'), {
      params: Promise.resolve({ id: 'sp-1' }),
    });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.totalClicks).toBe(5);
    expect(json.data.byIssue).toHaveLength(1);
  });

  it('returns 404 for an unknown sponsor', async () => {
    await setupRepo({ findById: vi.fn().mockResolvedValue(null) });
    const res = await sponsorAnalytics(makeRequest('GET', '/api/sponsors/nope/analytics'), {
      params: Promise.resolve({ id: 'nope' }),
    });
    expect(res.status).toBe(404);
  });
});
