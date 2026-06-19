/**
 * importCommittedCandidates tests.
 *
 * Uses a real temp directory + a fake IngestRepository.
 * No DB or Prisma involved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { IngestRepository, PersistRunOpts, EnrichedCandidate } from '../ingest/types.js';
import type { StoredCandidate } from '../ingest/candidate-file.js';
import { writePool } from '../ingest/candidate-file.js';
import { importCommittedCandidates } from '../ingest/import-pool.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeStoredCandidate(overrides: Partial<StoredCandidate> = {}): StoredCandidate {
  return {
    title: 'Test Article',
    sourceUrl: 'https://example.com/article',
    sourceName: 'Test Source',
    rawExcerpt: 'An excerpt.',
    publishedAt: '2024-03-10T08:30:00.000Z',
    canonicalUrl: 'https://example.com/article',
    contentHash: 'abc123',
    firstSeenAt: '2024-06-01T12:00:00.000Z',
    ingestRunId: 'run-001',
    ...overrides,
  };
}

function makeFakeRepo(): IngestRepository & { calls: PersistRunOpts[] } {
  const calls: PersistRunOpts[] = [];
  return {
    calls,
    findExistingUrls: async () => new Set<string>(),
    findExistingHashes: async () => new Set<string>(),
    persistRun: vi.fn(async (opts: PersistRunOpts) => {
      calls.push(opts);
      return 'fake-run-id';
    }) as IngestRepository['persistRun'],
  };
}

// ---------------------------------------------------------------------------
// Missing directory / file — benign no-op
// ---------------------------------------------------------------------------

describe('importCommittedCandidates — missing artifact', () => {
  it('returns { poolSize: 0, imported: 0 } when the directory does not exist', async () => {
    // Arrange
    const dir = path.join(os.tmpdir(), `import-pool-missing-${Date.now()}`);
    const repo = makeFakeRepo();

    // Act
    const result = await importCommittedCandidates({ dir, repository: repo });

    // Assert
    expect(result).toEqual({ poolSize: 0, imported: 0 });
  });

  it('does NOT call persistRun when the directory does not exist', async () => {
    // Arrange
    const dir = path.join(os.tmpdir(), `import-pool-missing-${Date.now()}`);
    const repo = makeFakeRepo();

    // Act
    await importCommittedCandidates({ dir, repository: repo });

    // Assert
    expect(repo.persistRun).not.toHaveBeenCalled();
  });

  it('does NOT throw when the directory is missing', async () => {
    // Arrange
    const dir = path.join(os.tmpdir(), `import-pool-missing-${Date.now()}`);

    // Act + Assert — must not throw
    await expect(
      importCommittedCandidates({ dir, repository: makeFakeRepo() }),
    ).resolves.toBeDefined();
  });

  it('returns { poolSize: 0, imported: 0 } when latest.jsonl is absent', async () => {
    // Arrange
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-pool-'));
    const repo = makeFakeRepo();

    // Act
    const result = await importCommittedCandidates({ dir, repository: repo });

    // Assert
    expect(result).toEqual({ poolSize: 0, imported: 0 });
    expect(repo.persistRun).not.toHaveBeenCalled();

    // Cleanup
    await fs.rm(dir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// Happy path — pool with N records
// ---------------------------------------------------------------------------

describe('importCommittedCandidates — pool import', () => {
  let dir: string;
  let repo: ReturnType<typeof makeFakeRepo>;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-pool-'));
    repo = makeFakeRepo();
  });

  async function cleanup(): Promise<void> {
    await fs.rm(dir, { recursive: true, force: true });
  }

  it('returns correct poolSize and imported counts', async () => {
    // Arrange
    const items = [
      makeStoredCandidate({ canonicalUrl: 'https://a.com/1', contentHash: 'h1' }),
      makeStoredCandidate({ canonicalUrl: 'https://b.com/2', contentHash: 'h2' }),
      makeStoredCandidate({ canonicalUrl: 'https://c.com/3', contentHash: 'h3' }),
    ];
    await writePool(dir, items);

    // Act
    const result = await importCommittedCandidates({ dir, repository: repo });

    // Assert
    expect(result.poolSize).toBe(3);
    expect(result.imported).toBe(3);
    await cleanup();
  });

  it('calls persistRun exactly once', async () => {
    // Arrange
    const items = [
      makeStoredCandidate({ canonicalUrl: 'https://a.com/1', contentHash: 'h1' }),
      makeStoredCandidate({ canonicalUrl: 'https://b.com/2', contentHash: 'h2' }),
    ];
    await writePool(dir, items);

    // Act
    await importCommittedCandidates({ dir, repository: repo });

    // Assert
    expect(repo.persistRun).toHaveBeenCalledTimes(1);
    await cleanup();
  });

  it('passes source === "committed-pool" to persistRun', async () => {
    // Arrange
    await writePool(dir, [makeStoredCandidate()]);

    // Act
    await importCommittedCandidates({ dir, repository: repo });

    // Assert
    const call = repo.calls[0];
    expect(call).toBeDefined();
    expect(call!.source).toBe('committed-pool');
    await cleanup();
  });

  it('passes N EnrichedCandidates with correct fields to persistRun', async () => {
    // Arrange
    const items = [
      makeStoredCandidate({
        title: 'Article Alpha',
        sourceUrl: 'https://alpha.com/x',
        sourceName: 'Alpha Source',
        rawExcerpt: 'Alpha excerpt',
        canonicalUrl: 'https://alpha.com/x',
        contentHash: 'hash-alpha',
        publishedAt: '2024-05-01T00:00:00.000Z',
      }),
      makeStoredCandidate({
        title: 'Article Beta',
        sourceUrl: 'https://beta.com/y',
        sourceName: 'Beta Source',
        rawExcerpt: undefined,
        canonicalUrl: 'https://beta.com/y',
        contentHash: 'hash-beta',
        publishedAt: null,
      }),
    ];
    await writePool(dir, items);

    // Act
    await importCommittedCandidates({ dir, repository: repo });

    // Assert
    const call = repo.calls[0];
    expect(call).toBeDefined();
    const candidates = call!.candidates as readonly EnrichedCandidate[];
    expect(candidates).toHaveLength(2);

    const alpha = candidates[0]!;
    expect(alpha.title).toBe('Article Alpha');
    expect(alpha.sourceUrl).toBe('https://alpha.com/x');
    expect(alpha.sourceName).toBe('Alpha Source');
    expect(alpha.rawExcerpt).toBe('Alpha excerpt');
    expect(alpha.canonicalUrl).toBe('https://alpha.com/x');
    expect(alpha.contentHash).toBe('hash-alpha');

    await cleanup();
  });

  it('maps ISO publishedAt string to a Date object', async () => {
    // Arrange
    await writePool(dir, [
      makeStoredCandidate({ publishedAt: '2024-05-01T10:00:00.000Z', canonicalUrl: 'https://a.com/1', contentHash: 'h1' }),
    ]);

    // Act
    await importCommittedCandidates({ dir, repository: repo });

    // Assert
    const candidate = repo.calls[0]!.candidates[0] as EnrichedCandidate;
    expect(candidate.publishedAt).toBeInstanceOf(Date);
    expect((candidate.publishedAt as Date).toISOString()).toBe('2024-05-01T10:00:00.000Z');
    await cleanup();
  });

  it('maps null publishedAt to undefined', async () => {
    // Arrange
    await writePool(dir, [
      makeStoredCandidate({ publishedAt: null, canonicalUrl: 'https://a.com/1', contentHash: 'h1' }),
    ]);

    // Act
    await importCommittedCandidates({ dir, repository: repo });

    // Assert
    const candidate = repo.calls[0]!.candidates[0] as EnrichedCandidate;
    expect(candidate.publishedAt).toBeUndefined();
    await cleanup();
  });

  it('carries canonicalUrl and contentHash through unchanged', async () => {
    // Arrange
    await writePool(dir, [
      makeStoredCandidate({
        canonicalUrl: 'https://canonical.example.com/article',
        contentHash: 'sha256-deadbeef',
      }),
    ]);

    // Act
    await importCommittedCandidates({ dir, repository: repo });

    // Assert
    const candidate = repo.calls[0]!.candidates[0] as EnrichedCandidate;
    expect(candidate.canonicalUrl).toBe('https://canonical.example.com/article');
    expect(candidate.contentHash).toBe('sha256-deadbeef');
    await cleanup();
  });

  it('passes errors: [] to persistRun', async () => {
    // Arrange
    await writePool(dir, [makeStoredCandidate()]);

    // Act
    await importCommittedCandidates({ dir, repository: repo });

    // Assert
    expect(repo.calls[0]!.errors).toEqual([]);
    await cleanup();
  });
});

// ---------------------------------------------------------------------------
// Pre-filter — already-known candidates are not re-imported
// ---------------------------------------------------------------------------

describe('importCommittedCandidates — pre-filter against existing rows', () => {
  it('skips persistRun and imports 0 when every candidate already exists', async () => {
    // Arrange
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-pool-'));
    await writePool(dir, [
      makeStoredCandidate({ canonicalUrl: 'https://a.com/1', contentHash: 'h1' }),
      makeStoredCandidate({ canonicalUrl: 'https://b.com/2', contentHash: 'h2' }),
    ]);
    const persist = vi.fn(async () => 'rid');
    const repo: IngestRepository = {
      findExistingUrls: async (urls) => new Set(urls),
      findExistingHashes: async (hashes) => new Set(hashes),
      persistRun: persist as IngestRepository['persistRun'],
    };

    // Act
    const result = await importCommittedCandidates({ dir, repository: repo });

    // Assert
    expect(result).toEqual({ poolSize: 2, imported: 0 });
    expect(persist).not.toHaveBeenCalled();

    // Cleanup
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('imports only the candidates not already present', async () => {
    // Arrange
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-pool-'));
    await writePool(dir, [
      makeStoredCandidate({ canonicalUrl: 'https://a.com/1', contentHash: 'h1' }),
      makeStoredCandidate({ canonicalUrl: 'https://b.com/2', contentHash: 'h2' }),
    ]);
    const calls: PersistRunOpts[] = [];
    const repo: IngestRepository = {
      findExistingUrls: async () => new Set(['https://a.com/1']),
      findExistingHashes: async () => new Set(['h1']),
      persistRun: (async (opts: PersistRunOpts) => {
        calls.push(opts);
        return 'rid';
      }) as IngestRepository['persistRun'],
    };

    // Act
    const result = await importCommittedCandidates({ dir, repository: repo });

    // Assert
    expect(result).toEqual({ poolSize: 2, imported: 1 });
    expect(calls[0]!.candidates).toHaveLength(1);
    expect(calls[0]!.candidates[0]!.canonicalUrl).toBe('https://b.com/2');

    // Cleanup
    await fs.rm(dir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// Repository throws → importCommittedCandidates rejects
// (The worker's try/catch is what swallows it — tested in worker tests)
// ---------------------------------------------------------------------------

describe('importCommittedCandidates — repository error propagation', () => {
  it('rejects when the repository throws', async () => {
    // Arrange
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-pool-'));
    await writePool(dir, [makeStoredCandidate()]);

    const throwingRepo: IngestRepository = {
      findExistingUrls: async () => new Set(),
      findExistingHashes: async () => new Set(),
      persistRun: async () => {
        throw new Error('DB connection lost');
      },
    };

    // Act + Assert
    await expect(
      importCommittedCandidates({ dir, repository: throwingRepo }),
    ).rejects.toThrow('DB connection lost');

    // Cleanup
    await fs.rm(dir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// Logger injection — no throw when called with a silent logger
// ---------------------------------------------------------------------------

describe('importCommittedCandidates — logger', () => {
  it('accepts an injected logger and logs start/done on success', async () => {
    // Arrange
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-pool-'));
    await writePool(dir, [makeStoredCandidate()]);

    const infoMessages: string[] = [];
    const warnMessages: string[] = [];
    const mockLogger = {
      info: vi.fn((msg: string) => { infoMessages.push(msg); }),
      warn: vi.fn((msg: string) => { warnMessages.push(msg); }),
      error: vi.fn(),
    };

    // Act
    await importCommittedCandidates({ dir, repository: makeFakeRepo(), logger: mockLogger });

    // Assert
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('import-pool.start'),
      expect.any(Object),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('import-pool.done'),
      expect.any(Object),
    );

    // Cleanup
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('logs a warning when the pool is empty/missing', async () => {
    // Arrange
    const dir = path.join(os.tmpdir(), `import-pool-missing-logger-${Date.now()}`);
    const warnSpy = vi.fn();
    const mockLogger = {
      info: vi.fn(),
      warn: warnSpy,
      error: vi.fn(),
    };

    // Act
    await importCommittedCandidates({ dir, repository: makeFakeRepo(), logger: mockLogger });

    // Assert
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('import-pool.empty'),
      expect.any(Object),
    );
  });
});
