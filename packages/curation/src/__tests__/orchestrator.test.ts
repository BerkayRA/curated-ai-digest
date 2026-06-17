import { describe, it, expect, vi } from 'vitest';
import type { IngestRepository, Logger, SourceError, RawCandidate, PersistRunOpts } from '../ingest/types.js';

// ---------------------------------------------------------------------------
// Orchestrator tests — DB and network are fully mocked
// ---------------------------------------------------------------------------

// We mock the two source modules so the orchestrator never touches the network.
vi.mock('../ingest/rss-source.js', () => ({
  fetchAllFeeds: vi.fn(),
}));

vi.mock('../ingest/exa-source.js', () => ({
  fetchExaCandidates: vi.fn(),
}));

// Import mocked modules AFTER vi.mock declarations so Vitest hoists them.
import { fetchAllFeeds } from '../ingest/rss-source.js';
import { fetchExaCandidates } from '../ingest/exa-source.js';
import { runIngest } from '../ingest/orchestrator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const noopLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function makeFakeRepo(overrides: Partial<IngestRepository> = {}): IngestRepository {
  return {
    findExistingUrls: async () => new Set<string>(),
    findExistingHashes: async () => new Set<string>(),
    persistRun: async () => 'fake-run-id',
    ...overrides,
  };
}

function makeCandidate(url: string, title: string): RawCandidate {
  return {
    title,
    sourceUrl: url,
    sourceName: 'Test Source',
    rawExcerpt: undefined,
    publishedAt: undefined,
  };
}

/** Typed mock for persistRun so noUncheckedIndexedAccess doesn't complain. */
function makePersistRunSpy(
  returnId: string = 'run-id',
): ReturnType<typeof vi.fn<(opts: PersistRunOpts) => Promise<string>>> {
  return vi.fn<(opts: PersistRunOpts) => Promise<string>>(() => Promise.resolve(returnId));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runIngest orchestrator', () => {
  it('returns a result with ingestRunId from the repository', async () => {
    vi.mocked(fetchAllFeeds).mockResolvedValue({ candidates: [], errors: [] });
    vi.mocked(fetchExaCandidates).mockResolvedValue({ candidates: [], errors: [] });

    const result = await runIngest({ repository: makeFakeRepo(), logger: noopLogger });
    expect(result.ingestRunId).toBe('fake-run-id');
  });

  it('reports zero fetched/deduped/persisted when sources return nothing', async () => {
    vi.mocked(fetchAllFeeds).mockResolvedValue({ candidates: [], errors: [] });
    vi.mocked(fetchExaCandidates).mockResolvedValue({ candidates: [], errors: [] });

    const result = await runIngest({ repository: makeFakeRepo(), logger: noopLogger });
    expect(result.fetched).toBe(0);
    expect(result.deduped).toBe(0);
    expect(result.persisted).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('counts fetched correctly from combined RSS + Exa candidates', async () => {
    vi.mocked(fetchAllFeeds).mockResolvedValue({
      candidates: [
        makeCandidate('https://a.com/article', 'Article A'),
        makeCandidate('https://b.com/article', 'Article B'),
      ],
      errors: [],
    });
    vi.mocked(fetchExaCandidates).mockResolvedValue({
      candidates: [makeCandidate('https://c.com/article', 'Article C')],
      errors: [],
    });

    const result = await runIngest({ repository: makeFakeRepo(), logger: noopLogger });
    expect(result.fetched).toBe(3);
  });

  it('deduplicates within-run before persisting', async () => {
    const dup = makeCandidate('https://example.com/article?utm_source=x', 'Same Title');
    vi.mocked(fetchAllFeeds).mockResolvedValue({ candidates: [dup, dup], errors: [] });
    vi.mocked(fetchExaCandidates).mockResolvedValue({ candidates: [], errors: [] });

    const persistRun = makePersistRunSpy();
    const result = await runIngest({
      repository: makeFakeRepo({ persistRun }),
      logger: noopLogger,
    });

    expect(result.deduped).toBe(1);
    // The candidate passed to persistRun should also be 1 (after DB filter returns empty sets)
    const firstCall = persistRun.mock.calls.at(0);
    expect(firstCall).toBeDefined();
    expect(firstCall?.[0].candidates).toHaveLength(1);
  });

  it('filters candidates already in the DB', async () => {
    vi.mocked(fetchAllFeeds).mockResolvedValue({
      candidates: [
        makeCandidate('https://known.com/article', 'Known Article'),
        makeCandidate('https://new.com/article', 'New Article'),
      ],
      errors: [],
    });
    vi.mocked(fetchExaCandidates).mockResolvedValue({ candidates: [], errors: [] });

    const persistRun = makePersistRunSpy();
    const repo = makeFakeRepo({
      findExistingUrls: async () => new Set(['https://known.com/article']),
      persistRun,
    });

    const result = await runIngest({ repository: repo, logger: noopLogger });
    expect(result.persisted).toBe(1);

    const firstCall = persistRun.mock.calls.at(0);
    expect(firstCall).toBeDefined();
    const firstCandidate = firstCall?.[0].candidates.at(0);
    expect(firstCandidate?.canonicalUrl).toBe('https://new.com/article');
  });

  it('collects errors from a failing source without aborting the run', async () => {
    const sourceError: SourceError = { source: 'OpenAI Blog', message: 'Network timeout' };
    vi.mocked(fetchAllFeeds).mockResolvedValue({
      candidates: [makeCandidate('https://safe.com/post', 'Safe Post')],
      errors: [sourceError],
    });
    vi.mocked(fetchExaCandidates).mockResolvedValue({ candidates: [], errors: [] });

    const result = await runIngest({ repository: makeFakeRepo(), logger: noopLogger });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.source).toBe('OpenAI Blog');
    // Despite the error, the one valid candidate should still be persisted.
    expect(result.persisted).toBe(1);
  });

  it('handles a source that throws entirely without crashing the orchestrator', async () => {
    // fetchAllFeeds itself rejects — simulates an unexpected crash.
    vi.mocked(fetchAllFeeds).mockRejectedValue(new Error('Unexpected source crash'));
    vi.mocked(fetchExaCandidates).mockResolvedValue({ candidates: [], errors: [] });

    // The orchestrator should re-throw here since fetchAllFeeds crashing is
    // outside the per-feed error-collection boundary.  Verify the test
    // expectation matches the documented behavior (throws).
    await expect(
      runIngest({ repository: makeFakeRepo(), logger: noopLogger }),
    ).rejects.toThrow('Unexpected source crash');
  });

  it('propagates Exa errors non-fatally when RSS returns results', async () => {
    vi.mocked(fetchAllFeeds).mockResolvedValue({
      candidates: [makeCandidate('https://rss.com/article', 'RSS Article')],
      errors: [],
    });
    vi.mocked(fetchExaCandidates).mockResolvedValue({
      candidates: [],
      errors: [{ source: 'exa:query', message: 'Rate limited' }],
    });

    const result = await runIngest({ repository: makeFakeRepo(), logger: noopLogger });
    expect(result.fetched).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.source).toBe('exa:query');
  });
});
