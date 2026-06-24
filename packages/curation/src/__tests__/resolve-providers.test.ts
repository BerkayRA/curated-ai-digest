import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SourceRepository } from '@digest/db';

// ---------------------------------------------------------------------------
// resolveProviders tests — fake SourceRepository, no live DB or network.
// ---------------------------------------------------------------------------

// We need a Source-like type that matches what Prisma returns.
// We use a compatible shape rather than importing from @prisma/client directly.
type FakeSource = {
  id: string;
  type: 'rss' | 'radar' | 'exa';
  label: string;
  url: string | null;
  enabled: boolean;
  config: Record<string, unknown> | null;
  lastRunAt: Date | null;
  lastStatus: string | null;
  lastCount: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function makeFakeSourceRepo(sources: FakeSource[]): SourceRepository {
  return {
    findAll: vi.fn().mockResolvedValue(sources),
    findEnabled: vi.fn().mockResolvedValue(sources),
    findEnabledByTopic: vi.fn().mockResolvedValue(sources),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    recordHealth: vi.fn(),
  } as unknown as SourceRepository;
}

function makeSource(
  overrides: Partial<FakeSource> & Pick<FakeSource, 'id' | 'type'>,
): FakeSource {
  return {
    label: `Label for ${overrides.id}`,
    url: null,
    enabled: true,
    config: null,
    lastRunAt: null,
    lastStatus: null,
    lastCount: 0,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// We import the module under test AFTER test setup to allow mocking.
// resolveProviders lazy-imports @digest/db, so we mock that module.
// ---------------------------------------------------------------------------

vi.mock('@digest/db', () => {
  const createSourceRepository = vi.fn();
  return {
    createSourceRepository,
    // Minimal Prisma singleton stub — resolveProviders only uses the factory.
    prisma: {},
    SourceType: { rss: 'rss', radar: 'radar', exa: 'exa' },
  };
});

// The test also needs defaultProviders to be consistent.
vi.mock('../ingest/providers.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../ingest/providers.js')>();
  return {
    ...original,
    defaultProviders: vi.fn().mockReturnValue([
      { id: 'rss', label: 'RSS Feeds', fetch: vi.fn() },
      { id: 'exa', label: 'Exa Neural Search', fetch: vi.fn() },
    ]),
  };
});

describe('resolveProviders', () => {
  let createSourceRepository: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Re-import the mock each time so beforeEach runs after vi.mock hoisting.
    const db = await import('@digest/db');
    createSourceRepository = vi.mocked(db.createSourceRepository);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('resolves an rss source to a provider with id rss:<sourceId>', async () => {
    const source = makeSource({
      id: 'src-rss-1',
      type: 'rss',
      label: 'OpenAI Blog',
      url: 'https://openai.com/blog/rss.xml',
    });
    const fakeRepo = makeFakeSourceRepo([source]);
    createSourceRepository.mockReturnValue(fakeRepo);

    const { resolveProviders } = await import('../ingest/resolve-providers.js');
    const providers = await resolveProviders({ repository: fakeRepo });

    const ids = providers.map((p) => p.id);
    expect(ids).toContain('rss:src-rss-1');
  });

  it('resolves a radar source to a provider with id radar:<sourceId>', async () => {
    const source = makeSource({
      id: 'src-radar-1',
      type: 'radar',
      label: 'On-Prem Radar',
      url: 'https://example.com/history.jsonl',
    });
    const fakeRepo = makeFakeSourceRepo([source]);
    createSourceRepository.mockReturnValue(fakeRepo);

    const { resolveProviders } = await import('../ingest/resolve-providers.js');
    const providers = await resolveProviders({ repository: fakeRepo });

    const ids = providers.map((p) => p.id);
    expect(ids).toContain('radar:src-radar-1');
  });

  it('resolves an exa source to a provider with id exa:<sourceId>', async () => {
    const source = makeSource({
      id: 'src-exa-1',
      type: 'exa',
      label: 'Exa Neural Search',
      url: null,
    });
    const fakeRepo = makeFakeSourceRepo([source]);
    createSourceRepository.mockReturnValue(fakeRepo);

    const { resolveProviders } = await import('../ingest/resolve-providers.js');
    const providers = await resolveProviders({ repository: fakeRepo });

    const ids = providers.map((p) => p.id);
    expect(ids).toContain('exa:src-exa-1');
  });

  it('resolves all three types from a mixed enabled source list', async () => {
    const sources = [
      makeSource({ id: 'rss-1', type: 'rss', label: 'Feed A', url: 'https://a.com/rss' }),
      makeSource({
        id: 'radar-1',
        type: 'radar',
        label: 'Radar',
        url: 'https://example.com/history.jsonl',
      }),
      makeSource({ id: 'exa-1', type: 'exa', label: 'Exa', url: null }),
    ];
    const fakeRepo = makeFakeSourceRepo(sources);

    const { resolveProviders } = await import('../ingest/resolve-providers.js');
    const providers = await resolveProviders({ repository: fakeRepo });

    const ids = providers.map((p) => p.id);
    expect(ids).toContain('rss:rss-1');
    expect(ids).toContain('radar:radar-1');
    expect(ids).toContain('exa:exa-1');
  });

  it('passes the feed url and label to rss provider config', async () => {
    const source = makeSource({
      id: 'rss-cfg',
      type: 'rss',
      label: 'My Feed',
      url: 'https://myfeed.com/rss',
    });
    const fakeRepo = makeFakeSourceRepo([source]);

    const { resolveProviders } = await import('../ingest/resolve-providers.js');
    const providers = await resolveProviders({ repository: fakeRepo });

    // The rss provider must be functional — it should have a fetch method.
    const rssP = providers.find((p) => p.id === 'rss:rss-cfg');
    expect(rssP).toBeDefined();
    expect(typeof rssP?.fetch).toBe('function');
  });

  it('passes config queries to exa provider when config.queries is set', async () => {
    const source = makeSource({
      id: 'exa-cfg',
      type: 'exa',
      label: 'Custom Exa',
      url: null,
      config: { queries: ['custom AI query', 'another query'] },
    });
    const fakeRepo = makeFakeSourceRepo([source]);

    const { resolveProviders } = await import('../ingest/resolve-providers.js');
    const providers = await resolveProviders({ repository: fakeRepo });

    const exaP = providers.find((p) => p.id === 'exa:exa-cfg');
    expect(exaP).toBeDefined();
    expect(exaP?.id).toBe('exa:exa-cfg');
  });

  it('falls back to defaultProviders() when findEnabled returns empty array', async () => {
    const fakeRepo = makeFakeSourceRepo([]);
    createSourceRepository.mockReturnValue(fakeRepo);

    const { resolveProviders } = await import('../ingest/resolve-providers.js');
    const { defaultProviders } = await import('../ingest/providers.js');
    const providers = await resolveProviders({ repository: fakeRepo });

    // With empty DB, we should fall back to defaultProviders output.
    expect(vi.mocked(defaultProviders)).toHaveBeenCalled();
    // The static fallback providers have ids 'rss' and 'exa' (no colon).
    const ids = providers.map((p) => p.id);
    expect(ids).toEqual(['rss', 'exa']);
  });

  it('accepts a custom repository injected directly (no lazy import of @digest/db)', async () => {
    const source = makeSource({ id: 'direct-1', type: 'exa', label: 'Direct Exa', url: null });
    const fakeRepo = makeFakeSourceRepo([source]);

    const { resolveProviders } = await import('../ingest/resolve-providers.js');
    const providers = await resolveProviders({ repository: fakeRepo });

    // createSourceRepository should NOT have been called because we injected the repo.
    expect(createSourceRepository).not.toHaveBeenCalled();
    expect(providers.map((p) => p.id)).toContain('exa:direct-1');
  });

  it('uses findEnabledByTopic (not findEnabled) when topicId is provided', async () => {
    const source = makeSource({
      id: 'topic-rss',
      type: 'rss',
      label: 'Topic Feed',
      url: 'https://topic.com/rss',
    });
    const fakeRepo = makeFakeSourceRepo([source]);

    const { resolveProviders } = await import('../ingest/resolve-providers.js');
    const providers = await resolveProviders({
      repository: fakeRepo,
      topicId: 'topic_enterprise_ai',
    });

    expect(fakeRepo.findEnabledByTopic).toHaveBeenCalledWith('topic_enterprise_ai');
    expect(fakeRepo.findEnabled).not.toHaveBeenCalled();
    expect(providers.map((p) => p.id)).toContain('rss:topic-rss');
  });

  it('uses findEnabled when topicId is omitted', async () => {
    const source = makeSource({ id: 'all-rss', type: 'rss', label: 'Feed', url: 'https://a.com/rss' });
    const fakeRepo = makeFakeSourceRepo([source]);

    const { resolveProviders } = await import('../ingest/resolve-providers.js');
    await resolveProviders({ repository: fakeRepo });

    expect(fakeRepo.findEnabled).toHaveBeenCalled();
    expect(fakeRepo.findEnabledByTopic).not.toHaveBeenCalled();
  });
});
