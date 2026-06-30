import { describe, it, expect } from 'vitest';
import { scoreSignal, classifyRing, classifyChangeType, scoreDimensions } from '../scoring';
import { DIMENSIONS, type DimensionWeights, type RawSignal, type RingGates } from '../types';

// ---------------------------------------------------------------------------
// Pure scoring + classification — deterministic, no I/O. The real heuristics are
// a later phase; these tests lock the scaffold's documented default behavior.
// ---------------------------------------------------------------------------

const EVEN_WEIGHTS = Object.fromEntries(DIMENSIONS.map((d) => [d, 1])) as DimensionWeights;

const GATES: RingGates = {
  adopt: { minScore: 0.78 },
  pilot: { minScore: 0.6 },
  watch: { minScore: 0.4 },
};

function signal(metrics: Record<string, number> = {}): RawSignal {
  return {
    sourceId: 'github-x',
    project: 'X',
    category: 'model_serving',
    url: 'https://example.com/x',
    evidence: ['highlight'],
    metrics,
    observedAt: '2026-06-18T00:00:00.000Z',
  };
}

describe('scoreDimensions', () => {
  it('defaults every dimension to 0.5 with no metrics', () => {
    const scores = scoreDimensions(signal());
    for (const d of DIMENSIONS) expect(scores[d]).toBe(0.5);
  });

  it('uses a provided per-dimension metric and clamps to [0,1]', () => {
    const scores = scoreDimensions(signal({ workflow_impact: 1.5, demo_value: -0.2 }));
    expect(scores.workflow_impact).toBe(1);
    expect(scores.demo_value).toBe(0);
  });
});

describe('scoreSignal', () => {
  it('is deterministic: same input → same output', () => {
    const a = scoreSignal(signal({ workflow_impact: 0.9 }), EVEN_WEIGHTS);
    const b = scoreSignal(signal({ workflow_impact: 0.9 }), EVEN_WEIGHTS);
    expect(a.score).toBe(b.score);
    expect(a.scores).toEqual(b.scores);
  });

  it('composite of all-0.5 dimensions is 0.5 regardless of weights', () => {
    const result = scoreSignal(signal(), EVEN_WEIGHTS);
    expect(result.score).toBeCloseTo(0.5, 10);
  });

  it('weights shift the composite toward heavily-weighted dimensions', () => {
    const weighted: DimensionWeights = { ...EVEN_WEIGHTS, workflow_impact: 100 };
    const result = scoreSignal(signal({ workflow_impact: 1 }), weighted);
    // Dominated by workflow_impact (=1), so well above the 0.5 baseline.
    expect(result.score).toBeGreaterThan(0.9);
  });
});

describe('classifyRing', () => {
  it('assigns the highest ring whose gate is cleared', () => {
    expect(classifyRing(0.8, GATES)).toBe('adopt');
    expect(classifyRing(0.65, GATES)).toBe('pilot');
    expect(classifyRing(0.45, GATES)).toBe('watch');
    expect(classifyRing(0.2, GATES)).toBe('avoid');
  });

  it('treats the gate as inclusive (>= minScore)', () => {
    expect(classifyRing(0.78, GATES)).toBe('adopt');
    expect(classifyRing(0.6, GATES)).toBe('pilot');
  });
});

describe('classifyChangeType', () => {
  it('returns new when there is no previous ring', () => {
    expect(classifyChangeType('watch', undefined)).toBe('new');
  });

  it('returns promoted/demoted/updated by rank delta', () => {
    expect(classifyChangeType('adopt', 'pilot')).toBe('promoted');
    expect(classifyChangeType('pilot', 'adopt')).toBe('demoted');
    expect(classifyChangeType('pilot', 'pilot')).toBe('updated');
  });
});
