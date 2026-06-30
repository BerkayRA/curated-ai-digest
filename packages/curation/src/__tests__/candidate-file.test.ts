import { describe, it, expect } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import {
  toStored,
  serializeStored,
  parseStoredLine,
  readPool,
  writePool,
  CANDIDATES_DIR_DEFAULT,
  LATEST_FILE,
  INDEX_FILE,
} from '../ingest/candidate-file';
import type { StoredCandidate } from '../ingest/candidate-file';
import type { EnrichedCandidate } from '../ingest/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEnriched(overrides: Partial<EnrichedCandidate> = {}): EnrichedCandidate {
  return {
    title: 'Test Article',
    sourceUrl: 'https://example.com/article',
    sourceName: 'Test Source',
    rawExcerpt: 'An excerpt.',
    publishedAt: new Date('2024-01-15T10:00:00.000Z'),
    canonicalUrl: 'https://example.com/article',
    contentHash: 'abc123',
    ...overrides,
  };
}

const FIXED_RUN_ID = 'run-001';
const FIXED_NOW = new Date('2024-06-01T12:00:00.000Z');

// ---------------------------------------------------------------------------
// toStored
// ---------------------------------------------------------------------------

describe('toStored', () => {
  it('maps enriched candidate fields to stored record', () => {
    // Arrange
    const enriched = makeEnriched();

    // Act
    const stored = toStored(enriched, FIXED_RUN_ID, FIXED_NOW);

    // Assert
    expect(stored.title).toBe('Test Article');
    expect(stored.sourceUrl).toBe('https://example.com/article');
    expect(stored.sourceName).toBe('Test Source');
    expect(stored.rawExcerpt).toBe('An excerpt.');
    expect(stored.canonicalUrl).toBe('https://example.com/article');
    expect(stored.contentHash).toBe('abc123');
    expect(stored.ingestRunId).toBe('run-001');
    expect(stored.firstSeenAt).toBe('2024-06-01T12:00:00.000Z');
  });

  it('serializes publishedAt Date to ISO string', () => {
    // Arrange
    const enriched = makeEnriched({ publishedAt: new Date('2024-03-10T08:30:00.000Z') });

    // Act
    const stored = toStored(enriched, FIXED_RUN_ID, FIXED_NOW);

    // Assert
    expect(stored.publishedAt).toBe('2024-03-10T08:30:00.000Z');
  });

  it('maps undefined publishedAt to null', () => {
    // Arrange
    const enriched = makeEnriched({ publishedAt: undefined });

    // Act
    const stored = toStored(enriched, FIXED_RUN_ID, FIXED_NOW);

    // Assert
    expect(stored.publishedAt).toBeNull();
  });

  it('preserves undefined rawExcerpt as undefined', () => {
    // Arrange
    const enriched = makeEnriched({ rawExcerpt: undefined });

    // Act
    const stored = toStored(enriched, FIXED_RUN_ID, FIXED_NOW);

    // Assert
    expect(stored.rawExcerpt).toBeUndefined();
  });

  it('does not mutate the input', () => {
    // Arrange
    const enriched = makeEnriched();
    const originalUrl = enriched.canonicalUrl;

    // Act
    toStored(enriched, FIXED_RUN_ID, FIXED_NOW);

    // Assert - input is unchanged
    expect(enriched.canonicalUrl).toBe(originalUrl);
  });
});

// ---------------------------------------------------------------------------
// serializeStored / parseStoredLine round-trip
// ---------------------------------------------------------------------------

describe('serializeStored + parseStoredLine round-trip', () => {
  it('serializes and parses back identically', () => {
    // Arrange
    const stored = toStored(makeEnriched(), FIXED_RUN_ID, FIXED_NOW);

    // Act
    const line = serializeStored(stored);
    const parsed = parseStoredLine(line);

    // Assert
    expect(parsed).toBeDefined();
    expect(parsed?.title).toBe(stored.title);
    expect(parsed?.sourceUrl).toBe(stored.sourceUrl);
    expect(parsed?.canonicalUrl).toBe(stored.canonicalUrl);
    expect(parsed?.contentHash).toBe(stored.contentHash);
    expect(parsed?.firstSeenAt).toBe(stored.firstSeenAt);
    expect(parsed?.ingestRunId).toBe(stored.ingestRunId);
    expect(parsed?.publishedAt).toBe(stored.publishedAt);
  });

  it('serializes to a single JSON line (no newlines in the value)', () => {
    // Arrange
    const stored = toStored(makeEnriched(), FIXED_RUN_ID, FIXED_NOW);

    // Act
    const line = serializeStored(stored);

    // Assert
    expect(line).not.toContain('\n');
    expect(() => JSON.parse(line)).not.toThrow();
  });

  it('round-trips null publishedAt', () => {
    // Arrange
    const stored = toStored(makeEnriched({ publishedAt: undefined }), FIXED_RUN_ID, FIXED_NOW);

    // Act + Assert
    const parsed = parseStoredLine(serializeStored(stored));
    expect(parsed?.publishedAt).toBeNull();
  });

  it('round-trips optional rawExcerpt', () => {
    // Arrange
    const stored = toStored(makeEnriched({ rawExcerpt: undefined }), FIXED_RUN_ID, FIXED_NOW);

    // Act + Assert
    const parsed = parseStoredLine(serializeStored(stored));
    expect(parsed?.rawExcerpt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseStoredLine — rejects invalid input
// ---------------------------------------------------------------------------

describe('parseStoredLine', () => {
  it('returns undefined for an empty string', () => {
    expect(parseStoredLine('')).toBeUndefined();
  });

  it('returns undefined for a blank line (whitespace only)', () => {
    expect(parseStoredLine('   ')).toBeUndefined();
  });

  it('returns undefined for garbage text', () => {
    expect(parseStoredLine('not json at all')).toBeUndefined();
  });

  it('returns undefined for invalid JSON', () => {
    expect(parseStoredLine('{ bad json')).toBeUndefined();
  });

  it('returns undefined when required fields are missing', () => {
    // Missing canonicalUrl, contentHash, firstSeenAt, ingestRunId
    const partial = JSON.stringify({ title: 'X', sourceUrl: 'https://x.com' });
    expect(parseStoredLine(partial)).toBeUndefined();
  });

  it('returns undefined for a JSON array', () => {
    expect(parseStoredLine('[]')).toBeUndefined();
  });

  it('returns undefined for a JSON null', () => {
    expect(parseStoredLine('null')).toBeUndefined();
  });

  it('returns a valid StoredCandidate for a well-formed line', () => {
    // Arrange
    const stored = toStored(makeEnriched(), FIXED_RUN_ID, FIXED_NOW);
    const line = serializeStored(stored);

    // Act
    const result = parseStoredLine(line);

    // Assert
    expect(result).toBeDefined();
    expect(result?.canonicalUrl).toBe('https://example.com/article');
  });
});

// ---------------------------------------------------------------------------
// readPool — tolerates missing file
// ---------------------------------------------------------------------------

describe('readPool', () => {
  it('returns empty array when directory does not exist', async () => {
    // Arrange — use a path that definitely does not exist
    const missingDir = path.join(os.tmpdir(), `nonexistent-${Date.now()}`);

    // Act
    const result = await readPool(missingDir);

    // Assert
    expect(result).toEqual([]);
  });

  it('returns empty array when latest.jsonl is missing', async () => {
    // Arrange
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'curation-test-'));

    // Act
    const result = await readPool(dir);

    // Assert
    expect(result).toEqual([]);

    // Cleanup
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('reads a valid pool written by writePool', async () => {
    // Arrange
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'curation-test-'));
    const items: StoredCandidate[] = [
      toStored(makeEnriched({ title: 'Art A', canonicalUrl: 'https://a.com/a', contentHash: 'h1' }), 'r1', FIXED_NOW),
      toStored(makeEnriched({ title: 'Art B', canonicalUrl: 'https://b.com/b', sourceUrl: 'https://b.com/b', contentHash: 'h2' }), 'r1', FIXED_NOW),
    ];

    // Act
    await writePool(dir, items);
    const result = await readPool(dir);

    // Assert
    expect(result).toHaveLength(2);
    expect(result[0]?.title).toBe('Art A');
    expect(result[1]?.title).toBe('Art B');

    // Cleanup
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('skips garbage lines in the NDJSON file', async () => {
    // Arrange
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'curation-test-'));
    const validLine = serializeStored(toStored(makeEnriched(), FIXED_RUN_ID, FIXED_NOW));
    const ndjson = `${validLine}\ngarbageline\n${validLine.replace('"contentHash":"abc123"', '"contentHash":"def456"')}\n`;
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, LATEST_FILE), ndjson, 'utf8');

    // Act
    const result = await readPool(dir);

    // Assert — only the 2 valid lines parsed, garbage skipped
    expect(result).toHaveLength(2);

    // Cleanup
    await fs.rm(dir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('CANDIDATES_DIR_DEFAULT is data/candidates', () => {
    expect(CANDIDATES_DIR_DEFAULT).toBe('data/candidates');
  });

  it('LATEST_FILE is latest.jsonl', () => {
    expect(LATEST_FILE).toBe('latest.jsonl');
  });

  it('INDEX_FILE is index.json', () => {
    expect(INDEX_FILE).toBe('index.json');
  });
});
