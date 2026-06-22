import { describe, it, expect } from 'vitest';
import {
  recencyScore,
  sourceTierScore,
  topicScore,
  scoreCandidate,
  heuristicCurate,
  candidateToDraftItem,
  groupBySourceTopN,
  type CandidateView,
} from '../curate/heuristic.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2026-06-22T12:00:00.000Z');
const daysAgo = (n: number): Date => new Date(NOW.getTime() - n * 86_400_000);

function candidate(overrides: Partial<CandidateView> = {}): CandidateView {
  return {
    title: 'Some AI news',
    sourceUrl: 'https://example.com/a',
    sourceName: 'Example Source',
    rawExcerpt: null,
    publishedAt: daysAgo(1),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// recencyScore
// ---------------------------------------------------------------------------

describe('recencyScore', () => {
  it('is 1 for an article published now or in the future', () => {
    expect(recencyScore(candidate({ publishedAt: NOW }), NOW)).toBe(1);
    expect(recencyScore(candidate({ publishedAt: daysAgo(-2) }), NOW)).toBe(1);
  });

  it('decays linearly to 0 across the recency window', () => {
    expect(recencyScore(candidate({ publishedAt: daysAgo(7) }), NOW)).toBeCloseTo(0.5, 5);
    expect(recencyScore(candidate({ publishedAt: daysAgo(14) }), NOW)).toBe(0);
    expect(recencyScore(candidate({ publishedAt: daysAgo(30) }), NOW)).toBe(0);
  });

  it('falls back to fetchedAt when publishedAt is null', () => {
    const c = candidate({ publishedAt: null, fetchedAt: daysAgo(7) });
    expect(recencyScore(c, NOW)).toBeCloseTo(0.5, 5);
  });

  it('uses a mild default when both timestamps are missing', () => {
    expect(recencyScore(candidate({ publishedAt: null, fetchedAt: null }), NOW)).toBe(0.25);
  });
});

// ---------------------------------------------------------------------------
// sourceTierScore
// ---------------------------------------------------------------------------

describe('sourceTierScore', () => {
  it('rates known authoritative sources highest (case-insensitive)', () => {
    expect(sourceTierScore('OpenAI Blog')).toBe(1);
    expect(sourceTierScore('google deepmind blog')).toBe(1);
    expect(sourceTierScore('The Verge')).toBe(0.6);
  });

  it('returns the baseline for unknown sources', () => {
    expect(sourceTierScore('Some Random Blog')).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// topicScore
// ---------------------------------------------------------------------------

describe('topicScore', () => {
  it('is 0 when no keywords are present', () => {
    expect(topicScore(candidate({ title: 'A pleasant walk in the park', rawExcerpt: 'nice weather' }))).toBe(0);
  });

  it('saturates to 1 once enough distinct keywords appear', () => {
    const c = candidate({
      title: 'Enterprise on-prem LLM inference at scale',
      rawExcerpt: 'agent deployment with vLLM on GPU clusters',
    });
    expect(topicScore(c)).toBe(1);
  });

  it('counts excerpt text and is case-insensitive', () => {
    const c = candidate({ title: 'AI', rawExcerpt: 'ENTERPRISE workflow' });
    expect(topicScore(c)).toBeCloseTo(0.5, 5); // 2 distinct hits / saturation(4)
  });

  it('augments keywords with words from the configured topic', () => {
    const c = candidate({ title: 'New robotics breakthrough', rawExcerpt: 'humanoid demo' });
    expect(topicScore(c)).toBe(0); // none of the built-ins
    expect(topicScore(c, 'robotics humanoid systems')).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// scoreCandidate
// ---------------------------------------------------------------------------

describe('scoreCandidate', () => {
  it('ranks a recent, on-topic, authoritative article above an old off-topic unknown one', () => {
    const strong = candidate({
      sourceName: 'OpenAI Blog',
      title: 'Enterprise on-prem model serving',
      rawExcerpt: 'agent inference vLLM',
      publishedAt: daysAgo(1),
    });
    const weak = candidate({
      sourceName: 'Random Blog',
      title: 'A day at the beach',
      rawExcerpt: 'sunshine',
      publishedAt: daysAgo(40),
      sourceUrl: 'https://example.com/b',
    });
    expect(scoreCandidate(strong, { now: NOW })).toBeGreaterThan(scoreCandidate(weak, { now: NOW }));
  });

  it('stays within 0..1', () => {
    const c = candidate({ sourceName: 'OpenAI Blog', title: 'enterprise on-prem agent model vllm gpu', publishedAt: NOW });
    const score = scoreCandidate(c, { now: NOW });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// heuristicCurate
// ---------------------------------------------------------------------------

describe('heuristicCurate', () => {
  it('returns an empty array for no candidates', () => {
    expect(heuristicCurate([], { now: NOW })).toEqual([]);
  });

  it('prefers source diversity under the per-source cap', () => {
    // Three strong items from source A, one weaker from B. With cap 1, the
    // single B item must appear before a second A item.
    const a1 = candidate({ sourceUrl: 'https://a.com/1', sourceName: 'A', title: 'enterprise agent model', publishedAt: daysAgo(1) });
    const a2 = candidate({ sourceUrl: 'https://a.com/2', sourceName: 'A', title: 'enterprise agent model', publishedAt: daysAgo(1) });
    const a3 = candidate({ sourceUrl: 'https://a.com/3', sourceName: 'A', title: 'enterprise agent model', publishedAt: daysAgo(1) });
    const b1 = candidate({ sourceUrl: 'https://b.com/1', sourceName: 'B', title: 'agent', publishedAt: daysAgo(5) });

    const picked = heuristicCurate([a1, a2, a3, b1], { now: NOW, limit: 2, perSourceCap: 1 });
    const names = picked.map((c) => c.sourceName);
    expect(picked).toHaveLength(2);
    expect(new Set(names)).toEqual(new Set(['A', 'B']));
  });

  it('relaxes the cap to fill the limit when sources are too few', () => {
    const a1 = candidate({ sourceUrl: 'https://a.com/1', sourceName: 'A', publishedAt: daysAgo(1) });
    const a2 = candidate({ sourceUrl: 'https://a.com/2', sourceName: 'A', publishedAt: daysAgo(2) });
    const a3 = candidate({ sourceUrl: 'https://a.com/3', sourceName: 'A', publishedAt: daysAgo(3) });
    const picked = heuristicCurate([a1, a2, a3], { now: NOW, limit: 3, perSourceCap: 1 });
    expect(picked).toHaveLength(3); // all from A, cap relaxed
  });

  it('never selects the same URL twice', () => {
    const dup = candidate({ sourceUrl: 'https://a.com/x', sourceName: 'A' });
    const picked = heuristicCurate([dup, { ...dup }], { now: NOW, limit: 3 });
    expect(picked).toHaveLength(1);
  });

  it('caps the result at the requested limit', () => {
    const cands = Array.from({ length: 10 }, (_, i) =>
      candidate({ sourceUrl: `https://s.com/${i}`, sourceName: `S${i}`, publishedAt: daysAgo(i) }),
    );
    expect(heuristicCurate(cands, { now: NOW, limit: 3 })).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// candidateToDraftItem
// ---------------------------------------------------------------------------

describe('candidateToDraftItem', () => {
  it('maps title/excerpt/url/source and threads the candidate id', () => {
    const item = candidateToDraftItem(candidate({ id: 'cand123', title: 'T', rawExcerpt: 'E', sourceUrl: 'https://x', sourceName: 'S' }));
    expect(item).toEqual({
      titleTr: 'T',
      summaryTr: 'E',
      sourceUrl: 'https://x',
      sourceName: 'S',
      candidateArticleId: 'cand123',
    });
  });

  it('falls back to the title when the excerpt is empty/null (summary is never blank)', () => {
    expect(candidateToDraftItem(candidate({ title: 'Only title', rawExcerpt: null })).summaryTr).toBe('Only title');
    expect(candidateToDraftItem(candidate({ title: 'Only title', rawExcerpt: '   ' })).summaryTr).toBe('Only title');
  });

  it('omits candidateArticleId for file-pool candidates without an id', () => {
    const item = candidateToDraftItem(candidate({ id: undefined }));
    expect(item).not.toHaveProperty('candidateArticleId');
  });
});

// ---------------------------------------------------------------------------
// groupBySourceTopN
// ---------------------------------------------------------------------------

describe('groupBySourceTopN', () => {
  it('groups by source, caps each at n, and orders within a group by recency', () => {
    const a1 = candidate({ sourceUrl: 'https://a/1', sourceName: 'A', publishedAt: daysAgo(3) });
    const a2 = candidate({ sourceUrl: 'https://a/2', sourceName: 'A', publishedAt: daysAgo(1) });
    const a3 = candidate({ sourceUrl: 'https://a/3', sourceName: 'A', publishedAt: daysAgo(5) });
    const a4 = candidate({ sourceUrl: 'https://a/4', sourceName: 'A', publishedAt: daysAgo(2) });
    const b1 = candidate({ sourceUrl: 'https://b/1', sourceName: 'B', publishedAt: daysAgo(1) });

    const groups = groupBySourceTopN([a1, a2, a3, a4, b1], 3);
    const groupA = groups.find((g) => g.sourceName === 'A');
    expect(groupA?.items).toHaveLength(3); // capped
    expect(groupA?.items.map((i) => i.sourceUrl)).toEqual(['https://a/2', 'https://a/4', 'https://a/1']); // 1,2,3 days ago
    expect(groups.find((g) => g.sourceName === 'B')?.items).toHaveLength(1);
  });

  it('returns groups sorted alphabetically by source name', () => {
    const groups = groupBySourceTopN([
      candidate({ sourceUrl: 'https://z', sourceName: 'Zeta' }),
      candidate({ sourceUrl: 'https://a', sourceName: 'Alpha' }),
    ]);
    expect(groups.map((g) => g.sourceName)).toEqual(['Alpha', 'Zeta']);
  });
});
