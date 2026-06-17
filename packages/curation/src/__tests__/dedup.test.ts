import { describe, it, expect } from 'vitest';
import { deduplicateWithinRun, filterAgainstExisting } from '../ingest/dedup.js';
import type { RawCandidate, EnrichedCandidate } from '../ingest/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRaw(overrides: Partial<RawCandidate> = {}): RawCandidate {
  return {
    title: 'Default Title',
    sourceUrl: 'https://example.com/article',
    sourceName: 'Test Source',
    rawExcerpt: undefined,
    publishedAt: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// deduplicateWithinRun
// ---------------------------------------------------------------------------

describe('deduplicateWithinRun', () => {
  it('returns an empty array for empty input', () => {
    expect(deduplicateWithinRun([])).toHaveLength(0);
  });

  it('passes through a single unique candidate', () => {
    const result = deduplicateWithinRun([makeRaw()]);
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe('Default Title');
  });

  it('drops exact duplicate URLs with identical titles', () => {
    const raw = makeRaw({ sourceUrl: 'https://example.com/article', title: 'Title' });
    const result = deduplicateWithinRun([raw, raw]);
    expect(result).toHaveLength(1);
  });

  it('drops duplicate where tracking params make URLs look different', () => {
    const a = makeRaw({
      sourceUrl: 'https://example.com/article?utm_source=twitter',
      title: 'AI News',
    });
    const b = makeRaw({
      sourceUrl: 'https://example.com/article?utm_medium=email',
      title: 'AI News',
    });
    // Both canonicalize to https://example.com/article with the same title
    const result = deduplicateWithinRun([a, b]);
    expect(result).toHaveLength(1);
  });

  it('keeps candidates with distinct canonical URLs', () => {
    const a = makeRaw({ sourceUrl: 'https://example.com/article-a', title: 'Title A' });
    const b = makeRaw({ sourceUrl: 'https://example.com/article-b', title: 'Title B' });
    const result = deduplicateWithinRun([a, b]);
    expect(result).toHaveLength(2);
  });

  it('drops second occurrence of same canonical URL even with different title', () => {
    const a = makeRaw({ sourceUrl: 'https://example.com/article', title: 'Title A' });
    const b = makeRaw({ sourceUrl: 'https://example.com/article', title: 'Title B' });
    const result = deduplicateWithinRun([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe('Title A'); // first wins
  });

  it('enriches candidates with canonicalUrl and contentHash', () => {
    const raw = makeRaw({
      sourceUrl: 'https://example.com/post?utm_source=x',
      title: 'Some Title',
    });
    const result = deduplicateWithinRun([raw]);
    expect(result[0]?.canonicalUrl).toBe('https://example.com/post');
    expect(result[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// filterAgainstExisting
// ---------------------------------------------------------------------------

describe('filterAgainstExisting', () => {
  function makeEnriched(overrides: Partial<EnrichedCandidate> = {}): EnrichedCandidate {
    return {
      title: 'Title',
      sourceUrl: 'https://example.com/article',
      canonicalUrl: 'https://example.com/article',
      sourceName: 'Test Source',
      rawExcerpt: undefined,
      publishedAt: undefined,
      contentHash: 'abc123def456' + '0'.repeat(52),
      ...overrides,
    };
  }

  it('returns all candidates when no existing matches', () => {
    const candidates = [makeEnriched(), makeEnriched({ canonicalUrl: 'https://b.com/article', contentHash: 'b'.repeat(64) })];
    const result = filterAgainstExisting(candidates, new Set(), new Set());
    expect(result).toHaveLength(2);
  });

  it('filters out candidates whose canonicalUrl is already in the DB', () => {
    const existing = makeEnriched({ canonicalUrl: 'https://example.com/article' });
    const fresh = makeEnriched({ canonicalUrl: 'https://fresh.com/article', contentHash: 'f'.repeat(64) });
    const result = filterAgainstExisting(
      [existing, fresh],
      new Set(['https://example.com/article']),
      new Set(),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.canonicalUrl).toBe('https://fresh.com/article');
  });

  it('filters out candidates whose contentHash is already in the DB', () => {
    const hash = 'a'.repeat(64);
    const existing = makeEnriched({ canonicalUrl: 'https://new-url.com/article', contentHash: hash });
    const result = filterAgainstExisting([existing], new Set(), new Set([hash]));
    expect(result).toHaveLength(0);
  });

  it('returns empty array when all candidates are existing', () => {
    const c1 = makeEnriched({ canonicalUrl: 'https://a.com', contentHash: 'a'.repeat(64) });
    const c2 = makeEnriched({ canonicalUrl: 'https://b.com', contentHash: 'b'.repeat(64) });
    const result = filterAgainstExisting(
      [c1, c2],
      new Set(['https://a.com', 'https://b.com']),
      new Set(),
    );
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// URL scheme allowlist guard in deduplicateWithinRun
// ---------------------------------------------------------------------------

describe('deduplicateWithinRun — scheme allowlist', () => {
  it('skips candidates with javascript: scheme', () => {
    const raw = makeRaw({ sourceUrl: 'javascript:alert(1)', title: 'Malicious' });
    const result = deduplicateWithinRun([raw]);
    expect(result).toHaveLength(0);
  });

  it('skips candidates with data: scheme', () => {
    const raw = makeRaw({ sourceUrl: 'data:text/html,<script>evil</script>', title: 'Data' });
    const result = deduplicateWithinRun([raw]);
    expect(result).toHaveLength(0);
  });

  it('skips candidates with file: scheme', () => {
    const raw = makeRaw({ sourceUrl: 'file:///etc/passwd', title: 'Local File' });
    const result = deduplicateWithinRun([raw]);
    expect(result).toHaveLength(0);
  });

  it('keeps valid http candidates alongside rejected ones', () => {
    const good = makeRaw({ sourceUrl: 'https://example.com/article', title: 'Good' });
    const bad = makeRaw({ sourceUrl: 'javascript:void(0)', title: 'Bad' });
    const result = deduplicateWithinRun([good, bad]);
    expect(result).toHaveLength(1);
    expect(result[0]?.sourceUrl).toBe('https://example.com/article');
  });
});
