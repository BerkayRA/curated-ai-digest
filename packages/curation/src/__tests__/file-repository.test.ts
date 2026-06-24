import { describe, it, expect } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { createFileRepository } from '../ingest/file-repository.js';
import { readPool, LATEST_FILE, INDEX_FILE } from '../ingest/candidate-file.js';
import type { EnrichedCandidate } from '../ingest/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXED_NOW = new Date('2024-07-01T00:00:00.000Z');

function makeEnriched(overrides: Partial<EnrichedCandidate> = {}): EnrichedCandidate {
  return {
    title: 'Test Article',
    sourceUrl: 'https://example.com/article',
    sourceName: 'Test Source',
    rawExcerpt: 'Excerpt here.',
    publishedAt: new Date('2024-06-15T10:00:00.000Z'),
    canonicalUrl: 'https://example.com/article',
    contentHash: 'hash-001',
    ...overrides,
  };
}

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'file-repo-test-'));
}

// ---------------------------------------------------------------------------
// findExistingUrls / findExistingHashes on empty dir
// ---------------------------------------------------------------------------

describe('createFileRepository — empty state', () => {
  it('findExistingUrls returns empty set when no pool exists', async () => {
    // Arrange
    const dir = await makeTempDir();
    const repo = createFileRepository({ dir, now: () => FIXED_NOW });

    // Act
    const result = await repo.findExistingUrls(['https://example.com/article'], '');

    // Assert
    expect(result.size).toBe(0);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it('findExistingHashes returns empty set when no pool exists', async () => {
    // Arrange
    const dir = await makeTempDir();
    const repo = createFileRepository({ dir, now: () => FIXED_NOW });

    // Act
    const result = await repo.findExistingHashes(['hash-001'], '');

    // Assert
    expect(result.size).toBe(0);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it('findExistingUrls returns empty set for empty input', async () => {
    // Arrange
    const dir = await makeTempDir();
    const repo = createFileRepository({ dir, now: () => FIXED_NOW });

    // Act
    const result = await repo.findExistingUrls([], '');

    // Assert
    expect(result.size).toBe(0);

    await fs.rm(dir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// persistRun — first run writes pool + index
// ---------------------------------------------------------------------------

describe('persistRun — first run', () => {
  it('writes latest.jsonl with the persisted candidates', async () => {
    // Arrange
    const dir = await makeTempDir();
    const repo = createFileRepository({ dir, now: () => FIXED_NOW });
    const candidate = makeEnriched();

    // Act
    await repo.persistRun({ topicId: '', source: 'rss', candidates: [candidate], errors: [] });

    // Assert
    const pool = await readPool(dir);
    expect(pool).toHaveLength(1);
    expect(pool[0]?.canonicalUrl).toBe('https://example.com/article');

    await fs.rm(dir, { recursive: true, force: true });
  });

  it('writes index.json with correct metadata', async () => {
    // Arrange
    const dir = await makeTempDir();
    const repo = createFileRepository({ dir, now: () => FIXED_NOW });
    const candidate = makeEnriched();

    // Act
    await repo.persistRun({ topicId: '', source: 'rss+radar', candidates: [candidate], errors: [] });

    // Assert
    const indexRaw = await fs.readFile(path.join(dir, INDEX_FILE), 'utf8');
    const index = JSON.parse(indexRaw) as Record<string, unknown>;
    expect(index['source']).toBe('rss+radar');
    expect(index['poolSize']).toBe(1);
    expect(index['added']).toBe(1);
    expect(index['errorsCount']).toBe(0);
    expect(index['generatedAt']).toBe(FIXED_NOW.toISOString());

    await fs.rm(dir, { recursive: true, force: true });
  });

  it('returns a run id starting with file-', async () => {
    // Arrange
    const dir = await makeTempDir();
    const repo = createFileRepository({ dir, now: () => FIXED_NOW });

    // Act
    const runId = await repo.persistRun({ topicId: '', source: 'rss', candidates: [], errors: [] });

    // Assert
    expect(runId).toMatch(/^file-/);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it('creates the output directory if it does not exist', async () => {
    // Arrange
    const base = await makeTempDir();
    const dir = path.join(base, 'deep', 'nested', 'candidates');
    const repo = createFileRepository({ dir, now: () => FIXED_NOW });

    // Act
    await repo.persistRun({ topicId: '', source: 'rss', candidates: [makeEnriched()], errors: [] });

    // Assert
    const exists = await fs.access(path.join(dir, LATEST_FILE)).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    await fs.rm(base, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// persistRun — deduplication across runs
// ---------------------------------------------------------------------------

describe('persistRun — cross-run deduplication', () => {
  it('does not duplicate a URL already in the pool on a second run', async () => {
    // Arrange
    const dir = await makeTempDir();
    const repo = createFileRepository({ dir, now: () => FIXED_NOW });
    const candidate = makeEnriched({ title: 'First Title' });

    // Act — first run writes it
    await repo.persistRun({ topicId: '', source: 'rss', candidates: [candidate], errors: [] });
    // Second run with the same URL (same canonicalUrl)
    await repo.persistRun({ topicId: '', source: 'rss', candidates: [candidate], errors: [] });

    // Assert
    const pool = await readPool(dir);
    expect(pool).toHaveLength(1);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it('preserves firstSeenAt from the first run when a URL is re-submitted', async () => {
    // Arrange
    const firstNow = new Date('2024-06-01T00:00:00.000Z');
    const secondNow = new Date('2024-07-01T00:00:00.000Z');
    const dir = await makeTempDir();
    let nowCallIndex = 0;
    const repo = createFileRepository({
      dir,
      now: () => {
        if (nowCallIndex === 0) { nowCallIndex++; return firstNow; }
        return secondNow;
      },
    });
    const candidate = makeEnriched();

    // Act
    await repo.persistRun({ topicId: '', source: 'rss', candidates: [candidate], errors: [] });
    await repo.persistRun({ topicId: '', source: 'rss', candidates: [candidate], errors: [] });

    // Assert — firstSeenAt stays at the first run's time
    const pool = await readPool(dir);
    expect(pool[0]?.firstSeenAt).toBe(firstNow.toISOString());

    await fs.rm(dir, { recursive: true, force: true });
  });

  it('adds new candidates alongside already-existing ones', async () => {
    // Arrange
    const dir = await makeTempDir();
    const repo = createFileRepository({ dir, now: () => FIXED_NOW });
    const first = makeEnriched({ title: 'First', canonicalUrl: 'https://a.com/a', sourceUrl: 'https://a.com/a', contentHash: 'h1' });
    const second = makeEnriched({ title: 'Second', canonicalUrl: 'https://b.com/b', sourceUrl: 'https://b.com/b', contentHash: 'h2' });

    // Act
    await repo.persistRun({ topicId: '', source: 'rss', candidates: [first], errors: [] });
    await repo.persistRun({ topicId: '', source: 'rss', candidates: [second], errors: [] });

    // Assert
    const pool = await readPool(dir);
    expect(pool).toHaveLength(2);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it('findExistingUrls reflects persisted candidates after persistRun', async () => {
    // Arrange
    const dir = await makeTempDir();
    const repo = createFileRepository({ dir, now: () => FIXED_NOW });
    const candidate = makeEnriched({ canonicalUrl: 'https://known.com/a', sourceUrl: 'https://known.com/a' });

    // Act
    await repo.persistRun({ topicId: '', source: 'rss', candidates: [candidate], errors: [] });
    const existingUrls = await repo.findExistingUrls(['https://known.com/a', 'https://unknown.com/b'], '');

    // Assert
    expect(existingUrls.has('https://known.com/a')).toBe(true);
    expect(existingUrls.has('https://unknown.com/b')).toBe(false);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it('findExistingHashes reflects persisted candidates after persistRun', async () => {
    // Arrange
    const dir = await makeTempDir();
    const repo = createFileRepository({ dir, now: () => FIXED_NOW });
    const candidate = makeEnriched({ contentHash: 'known-hash-xyz' });

    // Act
    await repo.persistRun({ topicId: '', source: 'rss', candidates: [candidate], errors: [] });
    const existingHashes = await repo.findExistingHashes(['known-hash-xyz', 'other-hash'], '');

    // Assert
    expect(existingHashes.has('known-hash-xyz')).toBe(true);
    expect(existingHashes.has('other-hash')).toBe(false);

    await fs.rm(dir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// maxItems cap
// ---------------------------------------------------------------------------

describe('persistRun — maxItems cap', () => {
  it('caps the pool to maxItems keeping newest by publishedAt', async () => {
    // Arrange
    const dir = await makeTempDir();
    const repo = createFileRepository({ dir, maxItems: 3, now: () => FIXED_NOW });

    const candidates: EnrichedCandidate[] = Array.from({ length: 5 }, (_, i) =>
      makeEnriched({
        title: `Article ${i}`,
        canonicalUrl: `https://example.com/article-${i}`,
        sourceUrl: `https://example.com/article-${i}`,
        contentHash: `hash-${i}`,
        publishedAt: new Date(`2024-0${i + 1}-01T00:00:00.000Z`),
      }),
    );

    // Act
    await repo.persistRun({ topicId: '', source: 'rss', candidates, errors: [] });

    // Assert
    const pool = await readPool(dir);
    expect(pool).toHaveLength(3);
    // Newest 3: articles 2, 3, 4 (month 3, 4, 5) — sorted desc
    const titles = pool.map((p) => p.title);
    expect(titles).toContain('Article 4');
    expect(titles).toContain('Article 3');
    expect(titles).toContain('Article 2');
    expect(titles).not.toContain('Article 0');
    expect(titles).not.toContain('Article 1');

    await fs.rm(dir, { recursive: true, force: true });
  });

  it('defaults to maxItems=200 when not specified', async () => {
    // Arrange
    const dir = await makeTempDir();
    const repo = createFileRepository({ dir, now: () => FIXED_NOW });

    // 201 items → should cap at 200
    const candidates: EnrichedCandidate[] = Array.from({ length: 201 }, (_, i) =>
      makeEnriched({
        title: `Article ${i}`,
        canonicalUrl: `https://example.com/article-${i}`,
        sourceUrl: `https://example.com/article-${i}`,
        contentHash: `hash-${i}`,
        publishedAt: new Date(2024, 0, i + 1),
      }),
    );

    // Act
    await repo.persistRun({ topicId: '', source: 'rss', candidates, errors: [] });

    // Assert
    const pool = await readPool(dir);
    expect(pool).toHaveLength(200);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it('index.json added count reflects only newly added candidates', async () => {
    // Arrange
    const dir = await makeTempDir();
    const repo = createFileRepository({ dir, now: () => FIXED_NOW });
    const existing = makeEnriched({ title: 'Existing', canonicalUrl: 'https://a.com/a', sourceUrl: 'https://a.com/a', contentHash: 'h-exist' });
    const fresh = makeEnriched({ title: 'Fresh', canonicalUrl: 'https://b.com/b', sourceUrl: 'https://b.com/b', contentHash: 'h-fresh' });

    await repo.persistRun({ topicId: '', source: 'rss', candidates: [existing], errors: [] });

    // Act — second run: existing URL again + one new
    await repo.persistRun({ topicId: '', source: 'rss', candidates: [existing, fresh], errors: [] });

    // Assert
    const indexRaw = await fs.readFile(path.join(dir, INDEX_FILE), 'utf8');
    const index = JSON.parse(indexRaw) as Record<string, unknown>;
    expect(index['added']).toBe(1);
    expect(index['poolSize']).toBe(2);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it('index.json errorsCount matches errors passed to persistRun', async () => {
    // Arrange
    const dir = await makeTempDir();
    const repo = createFileRepository({ dir, now: () => FIXED_NOW });

    // Act
    await repo.persistRun({
      topicId: '',
      source: 'rss',
      candidates: [],
      errors: [{ source: 'rss', message: 'Feed timeout' }, { source: 'radar', message: 'HTTP 500' }],
    });

    // Assert
    const indexRaw = await fs.readFile(path.join(dir, INDEX_FILE), 'utf8');
    const index = JSON.parse(indexRaw) as Record<string, unknown>;
    expect(index['errorsCount']).toBe(2);

    await fs.rm(dir, { recursive: true, force: true });
  });
});
