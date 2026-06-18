import { describe, it, expect, vi } from 'vitest';
import { runIngest } from '../ingest/orchestrator.js';
import { DEFAULT_TOPIC } from '../ingest/sources.js';
import type {
  IngestRepository,
  Logger,
  SourceError,
  RawCandidate,
  PersistRunOpts,
  SourceContext,
  SourceFetchResult,
  SourceProvider,
} from '../ingest/types.js';

// ---------------------------------------------------------------------------
// Orchestrator tests — providers are injected as fakes; no network or DB.
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

/** A provider that returns a fixed result, ignoring context. */
function fakeProvider(id: string, result: SourceFetchResult, label = id): SourceProvider {
  return {
    id,
    label,
    fetch: async () => result,
  };
}

/** A provider that records the context it received. */
function recordingProvider(id: string, sink: { ctx?: SourceContext }): SourceProvider {
  return {
    id,
    label: id,
    fetch: async (ctx: SourceContext) => {
      sink.ctx = ctx;
      return { candidates: [], errors: [] };
    },
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
    const result = await runIngest({
      repository: makeFakeRepo(),
      logger: noopLogger,
      providers: [fakeProvider('rss', { candidates: [], errors: [] })],
    });
    expect(result.ingestRunId).toBe('fake-run-id');
  });

  it('reports zero fetched/deduped/persisted when providers return nothing', async () => {
    const result = await runIngest({
      repository: makeFakeRepo(),
      logger: noopLogger,
      providers: [
        fakeProvider('rss', { candidates: [], errors: [] }),
        fakeProvider('exa', { candidates: [], errors: [] }),
      ],
    });
    expect(result.fetched).toBe(0);
    expect(result.deduped).toBe(0);
    expect(result.persisted).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('merges candidates from all providers and counts per source', async () => {
    const result = await runIngest({
      repository: makeFakeRepo(),
      logger: noopLogger,
      providers: [
        fakeProvider('rss', {
          candidates: [
            makeCandidate('https://a.com/article', 'Article A'),
            makeCandidate('https://b.com/article', 'Article B'),
          ],
          errors: [],
        }),
        fakeProvider('exa', {
          candidates: [makeCandidate('https://c.com/article', 'Article C')],
          errors: [],
        }),
      ],
    });
    expect(result.fetched).toBe(3);
    expect(result.bySource).toEqual({ rss: 2, exa: 1 });
  });

  it('deduplicates within-run before persisting', async () => {
    const dup = makeCandidate('https://example.com/article?utm_source=x', 'Same Title');
    const persistRun = makePersistRunSpy();

    const result = await runIngest({
      repository: makeFakeRepo({ persistRun }),
      logger: noopLogger,
      providers: [fakeProvider('rss', { candidates: [dup, dup], errors: [] })],
    });

    expect(result.deduped).toBe(1);
    const firstCall = persistRun.mock.calls.at(0);
    expect(firstCall).toBeDefined();
    expect(firstCall?.[0].candidates).toHaveLength(1);
  });

  it('filters candidates already in the DB', async () => {
    const persistRun = makePersistRunSpy();
    const repo = makeFakeRepo({
      findExistingUrls: async () => new Set(['https://known.com/article']),
      persistRun,
    });

    const result = await runIngest({
      repository: repo,
      logger: noopLogger,
      providers: [
        fakeProvider('rss', {
          candidates: [
            makeCandidate('https://known.com/article', 'Known Article'),
            makeCandidate('https://new.com/article', 'New Article'),
          ],
          errors: [],
        }),
      ],
    });

    expect(result.persisted).toBe(1);
    const firstCandidate = persistRun.mock.calls.at(0)?.[0].candidates.at(0);
    expect(firstCandidate?.canonicalUrl).toBe('https://new.com/article');
  });

  it('collects non-fatal errors a provider returns without aborting the run', async () => {
    const sourceError: SourceError = { source: 'OpenAI Blog', message: 'Network timeout' };
    const result = await runIngest({
      repository: makeFakeRepo(),
      logger: noopLogger,
      providers: [
        fakeProvider('rss', {
          candidates: [makeCandidate('https://safe.com/post', 'Safe Post')],
          errors: [sourceError],
        }),
      ],
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.source).toBe('OpenAI Blog');
    expect(result.persisted).toBe(1);
  });

  it('isolates a thrown provider: others still contribute, error captured', async () => {
    const throwing: SourceProvider = {
      id: 'exa',
      label: 'exa',
      fetch: async () => {
        throw new Error('Unexpected source crash');
      },
    };

    const result = await runIngest({
      repository: makeFakeRepo(),
      logger: noopLogger,
      providers: [
        fakeProvider('rss', {
          candidates: [makeCandidate('https://rss.com/article', 'RSS Article')],
          errors: [],
        }),
        throwing,
      ],
    });

    // RSS still contributed despite Exa throwing.
    expect(result.fetched).toBe(1);
    expect(result.persisted).toBe(1);
    expect(result.bySource).toEqual({ rss: 1, exa: 0 });

    // The thrown error is captured as a SourceError keyed by the provider id.
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.source).toBe('exa');
    expect(result.errors[0]?.message).toBe('Unexpected source crash');
  });

  it('threads the default topic into every provider context', async () => {
    const a = { ctx: undefined as SourceContext | undefined };
    const b = { ctx: undefined as SourceContext | undefined };

    await runIngest({
      repository: makeFakeRepo(),
      logger: noopLogger,
      providers: [recordingProvider('rss', a), recordingProvider('exa', b)],
    });

    expect(a.ctx?.topic).toBe(DEFAULT_TOPIC);
    expect(b.ctx?.topic).toBe(DEFAULT_TOPIC);
    expect(a.ctx?.logger).toBe(noopLogger);
  });

  it('threads an overridden topic into every provider context', async () => {
    const sink = { ctx: undefined as SourceContext | undefined };

    await runIngest({
      repository: makeFakeRepo(),
      logger: noopLogger,
      topic: 'edge AI inference',
      providers: [recordingProvider('rss', sink)],
    });

    expect(sink.ctx?.topic).toBe('edge AI inference');
  });
});
