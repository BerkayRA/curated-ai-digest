import { describe, it, expect } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { runScan } from '../scan/run-scan.js';
import { readPool } from '../ingest/candidate-file.js';
import type { SourceProvider, SourceContext, SourceFetchResult, RawCandidate, Logger } from '../ingest/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const noopLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function makeRaw(overrides: Partial<RawCandidate> = {}): RawCandidate {
  return {
    title: 'Default Article',
    sourceUrl: 'https://example.com/article',
    sourceName: 'Test',
    rawExcerpt: undefined,
    publishedAt: new Date('2024-05-01T00:00:00.000Z'),
    ...overrides,
  };
}

function fakeProvider(id: string, result: SourceFetchResult): SourceProvider {
  return {
    id,
    label: id,
    fetch: async (_ctx: SourceContext): Promise<SourceFetchResult> => result,
  };
}

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'run-scan-test-'));
}

// ---------------------------------------------------------------------------
// runScan — basic integration
// ---------------------------------------------------------------------------

describe('runScan', () => {
  it('returns an IngestResult with fetched count', async () => {
    // Arrange
    const dir = await makeTempDir();
    const providers = [
      fakeProvider('rss', {
        candidates: [
          makeRaw({ title: 'Article A', sourceUrl: 'https://a.com/a' }),
          makeRaw({ title: 'Article B', sourceUrl: 'https://b.com/b' }),
        ],
        errors: [],
      }),
    ];

    // Act
    const result = await runScan({ dir, providers, logger: noopLogger });

    // Assert
    expect(result.fetched).toBe(2);
    expect(result.persisted).toBe(2);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it('writes enriched candidates to the pool file', async () => {
    // Arrange
    const dir = await makeTempDir();
    const providers = [
      fakeProvider('rss', {
        candidates: [
          makeRaw({ title: 'Article X', sourceUrl: 'https://x.com/post' }),
        ],
        errors: [],
      }),
    ];

    // Act
    await runScan({ dir, providers, logger: noopLogger });

    // Assert
    const pool = await readPool(dir);
    expect(pool).toHaveLength(1);
    expect(pool[0]?.title).toBe('Article X');
    expect(pool[0]?.canonicalUrl).toBe('https://x.com/post');
    expect(typeof pool[0]?.contentHash).toBe('string');
    expect(pool[0]?.contentHash.length).toBeGreaterThan(0);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it('deduplicates candidates across providers', async () => {
    // Arrange
    const dir = await makeTempDir();
    const dup = makeRaw({ title: 'Dup Article', sourceUrl: 'https://dup.com/article' });
    const providers = [
      fakeProvider('rss', { candidates: [dup], errors: [] }),
      fakeProvider('radar', { candidates: [dup], errors: [] }),
    ];

    // Act
    const result = await runScan({ dir, providers, logger: noopLogger });

    // Assert
    expect(result.fetched).toBe(2);
    expect(result.deduped).toBe(1);
    expect(result.persisted).toBe(1);
    const pool = await readPool(dir);
    expect(pool).toHaveLength(1);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it('dedups on second scan against already-written pool', async () => {
    // Arrange
    const dir = await makeTempDir();
    const candidate = makeRaw({ title: 'Existing', sourceUrl: 'https://existing.com/a' });
    const providers = [fakeProvider('rss', { candidates: [candidate], errors: [] })];

    // First scan
    await runScan({ dir, providers, logger: noopLogger });

    // Act — second scan with same candidate
    const result2 = await runScan({ dir, providers, logger: noopLogger });

    // Assert — already in pool, nothing new persisted
    expect(result2.persisted).toBe(0);
    const pool = await readPool(dir);
    expect(pool).toHaveLength(1);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it('collects per-source errors without aborting', async () => {
    // Arrange
    const dir = await makeTempDir();
    const failing: SourceProvider = {
      id: 'bad-source',
      label: 'bad-source',
      fetch: async () => {
        throw new Error('Source is down');
      },
    };
    const working = fakeProvider('rss', {
      candidates: [makeRaw({ title: 'Good Article', sourceUrl: 'https://good.com/a' })],
      errors: [],
    });

    // Act
    const result = await runScan({ dir, providers: [failing, working], logger: noopLogger });

    // Assert
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.source).toBe('bad-source');
    expect(result.persisted).toBe(1);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it('respects maxItems cap passed through', async () => {
    // Arrange
    const dir = await makeTempDir();
    const candidates = Array.from({ length: 10 }, (_, i) =>
      makeRaw({
        title: `Article ${i}`,
        sourceUrl: `https://example.com/article-${i}`,
        publishedAt: new Date(2024, 0, i + 1),
      }),
    );
    const providers = [fakeProvider('rss', { candidates, errors: [] })];

    // Act
    await runScan({ dir, providers, maxItems: 5, logger: noopLogger });

    // Assert
    const pool = await readPool(dir);
    expect(pool).toHaveLength(5);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it('uses DEFAULT_TOPIC when no topic is provided', async () => {
    // Arrange
    const dir = await makeTempDir();
    const recordedCtxs: SourceContext[] = [];
    const recording: SourceProvider = {
      id: 'test',
      label: 'test',
      fetch: async (ctx) => { recordedCtxs.push(ctx); return { candidates: [], errors: [] }; },
    };

    // Act
    await runScan({ dir, providers: [recording], logger: noopLogger });

    // Assert
    expect(recordedCtxs[0]?.topic).toBeTruthy();
    expect(typeof recordedCtxs[0]?.topic).toBe('string');

    await fs.rm(dir, { recursive: true, force: true });
  });

  it('threads a custom topic into provider context', async () => {
    // Arrange
    const dir = await makeTempDir();
    const recordedCtxs: SourceContext[] = [];
    const recording: SourceProvider = {
      id: 'test',
      label: 'test',
      fetch: async (ctx) => { recordedCtxs.push(ctx); return { candidates: [], errors: [] }; },
    };

    // Act
    await runScan({ dir, providers: [recording], topic: 'custom topic', logger: noopLogger });

    // Assert
    expect(recordedCtxs[0]?.topic).toBe('custom topic');

    await fs.rm(dir, { recursive: true, force: true });
  });
});
