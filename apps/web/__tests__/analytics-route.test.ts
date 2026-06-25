/**
 * Analytics API tests — covers GET /api/analytics?topic=<slug>.
 *
 * All DB access (createAnalyticsRepository, createTopicRepository,
 * getDefaultTopicId) and auth are mocked — no real DB or network calls (CI has
 * no DATABASE_URL).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type {
  AnalyticsRepository,
  TopicAnalyticsSummary,
  IssueAnalyticsRow,
  ClickedUrlRow,
  GrowthPoint,
  Topic,
  TopicRepository,
} from '@digest/db';

// ---------------------------------------------------------------------------
// Module mocks — declared before any import of the route under test.
// ---------------------------------------------------------------------------

vi.mock('@digest/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@digest/db')>();
  return {
    ...actual,
    createAnalyticsRepository: vi.fn(),
    createTopicRepository: vi.fn(),
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

const makeSummary = (overrides: Partial<TopicAnalyticsSummary> = {}): TopicAnalyticsSummary => ({
  totalSent: 1200,
  uniqueOpens: 540,
  uniqueClicks: 132,
  openRate: 0.45,
  ctr: 0.11,
  activeSubscribers: 1500,
  ...overrides,
});

const makeIssues = (): IssueAnalyticsRow[] => [
  {
    issueId: 'issue-1',
    isoWeek: '2026-W25',
    subject: 'Bu hafta kurumsal yapay zeka',
    sentAt: new Date('2026-06-18'),
    sentCount: 600,
    uniqueOpens: 300,
    uniqueClicks: 72,
  },
];

const makeClicks = (): ClickedUrlRow[] => [
  { url: 'https://example.com/article/one', clickCount: 48 },
  { url: 'https://news.test.org/ai', clickCount: 21 },
];

const makeGrowth = (): GrowthPoint[] => [
  { week: new Date('2026-06-11'), additions: 40 },
  { week: new Date('2026-06-18'), additions: 65 },
];

const makeTopic = (overrides: Partial<Topic> = {}): Topic =>
  ({
    id: 'topic-1',
    slug: 'enterprise-ai',
    name: 'Kurumsal AI',
    status: 'active',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }) as Topic;

const makeAnalyticsRepo = (
  overrides: Partial<AnalyticsRepository> = {},
): AnalyticsRepository => ({
  getTopicSummary: vi.fn().mockResolvedValue(makeSummary()),
  getIssueHistory: vi.fn().mockResolvedValue(makeIssues()),
  getTopClickedUrls: vi.fn().mockResolvedValue(makeClicks()),
  getSubscriberGrowth: vi.fn().mockResolvedValue(makeGrowth()),
  ...overrides,
});

function makeRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost:3100${path}`, { method: 'GET' });
}

async function setupMocks(analyticsOverrides: Partial<AnalyticsRepository> = {}) {
  const { createAnalyticsRepository, createTopicRepository } = await import('@digest/db');
  const analyticsRepo = makeAnalyticsRepo(analyticsOverrides);
  vi.mocked(createAnalyticsRepository).mockReturnValue(analyticsRepo);
  vi.mocked(createTopicRepository).mockReturnValue({
    findById: vi.fn().mockResolvedValue(makeTopic()),
    findBySlug: vi.fn().mockResolvedValue(makeTopic()),
  } as unknown as TopicRepository);
  return { analyticsRepo };
}

// ===========================================================================
// GET /api/analytics
// ===========================================================================

describe('GET /api/analytics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with the analytics payload', async () => {
    await setupMocks();

    const { GET } = await import('../app/api/analytics/route');
    const res = await GET(makeRequest('/api/analytics?topic=enterprise-ai'));
    const body = (await res.json()) as {
      success: boolean;
      data: {
        summary: TopicAnalyticsSummary;
        issues: IssueAnalyticsRow[];
        topClicks: ClickedUrlRow[];
        growth: GrowthPoint[];
        topicName: string | null;
      };
    };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.summary.totalSent).toBe(1200);
    expect(body.data.summary.openRate).toBeCloseTo(0.45);
    expect(body.data.issues).toHaveLength(1);
    expect(body.data.topClicks).toHaveLength(2);
    expect(body.data.growth).toHaveLength(2);
    expect(body.data.topicName).toBe('Kurumsal AI');
  });

  it('returns 500 when the analytics repository throws', async () => {
    await setupMocks({
      getTopicSummary: vi.fn().mockRejectedValue(new Error('DB connection failed')),
    });

    const { GET } = await import('../app/api/analytics/route');
    const res = await GET(makeRequest('/api/analytics'));
    const body = (await res.json()) as { success: boolean; error: string };

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toContain('DB connection failed');
  });
});
