// ---------------------------------------------------------------------------
// @mega-bulten/radar — deterministic scoring + ring classification
//
// PURE functions: no I/O, no clock, no randomness. Same inputs → same outputs,
// so the radar is reproducible and trivially unit-testable. See
// docs/RFC-001-mega-radar.md §3.3–3.4.
//
// The real per-dimension heuristics are a later phase (see the TODOs); this
// scaffold ships a simple, documented default that is fully functional so tests
// and the pipeline type-check today.
// ---------------------------------------------------------------------------

import { normalizeWeights } from './config.js';
import {
  DIMENSIONS,
  RINGS,
  RING_RANK,
  type DimensionScores,
  type DimensionWeights,
  type RawSignal,
  type Ring,
  type RingGate,
  type RingGates,
  type ScoredSignal,
} from './types.js';

/** Default per-dimension score used until real heuristics land (mid-range). */
const DEFAULT_DIMENSION_SCORE = 0.5;

/** Clamp a number into the [0, 1] range. */
function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Compute per-dimension scores for a signal.
 *
 * TODO(P2): replace the default with real heuristics per dimension, e.g.
 *  - open_source_maturity ← stars / release cadence / contributor count
 *  - laptop_runnability   ← package size / single-binary install
 *  - demo_value           ← release-note highlight count / recency
 *  - setup_friction       ← INVERTED: low friction ⇒ high score
 *  (each derived deterministically from `signal.metrics` / `signal.evidence`).
 *
 * For now every dimension defaults to {@link DEFAULT_DIMENSION_SCORE} unless the
 * collector already supplied a pre-computed value in `signal.metrics` keyed by
 * the dimension name — letting tests and early collectors exercise real values.
 */
export function scoreDimensions(signal: RawSignal): DimensionScores {
  const scores = Object.fromEntries(
    DIMENSIONS.map((d) => {
      const provided = signal.metrics[d];
      const value = typeof provided === 'number' ? clamp01(provided) : DEFAULT_DIMENSION_SCORE;
      return [d, value] as const;
    }),
  ) as DimensionScores;
  return scores;
}

/**
 * Score a raw signal: compute per-dimension scores and the composite score as
 * the normalized weighted sum. Pure and deterministic.
 *
 * Weights are normalized defensively here too, so callers may pass raw weights.
 */
export function scoreSignal(signal: RawSignal, weights: DimensionWeights): ScoredSignal {
  const normalized = normalizeWeights(weights);
  const scores = scoreDimensions(signal);

  const composite = DIMENSIONS.reduce((sum, d) => sum + scores[d] * normalized[d], 0);

  return {
    ...signal,
    scores,
    score: clamp01(composite),
  };
}

/** Does a composite score clear a ring's absolute `minScore` gate? */
function clearsGate(score: number, gate: RingGate): boolean {
  return score >= gate.minScore;
}

/**
 * Classify a composite score into a ring using ONLY the absolute `minScore`
 * gates: walk the positive rings high→low and assign the highest one cleared;
 * below `watch.minScore` ⇒ `avoid`. Pure and deterministic.
 *
 * TODO(P3): fold in per-dimension floors (minOpenSourceMaturity,
 * minSecurityPosture), relative promotion (band + topFraction over a category),
 * and per-category quotas. Those need the full signal + run context, so the
 * richer classifier will take a ScoredSignal[] rather than a bare score.
 */
export function classifyRing(score: number, gates: RingGates): Ring {
  if (clearsGate(score, gates.adopt)) return 'adopt';
  if (clearsGate(score, gates.pilot)) return 'pilot';
  if (clearsGate(score, gates.watch)) return 'watch';
  return 'avoid';
}

/**
 * Determine the change_type for a project given its new ring and (optional)
 * previous ring. Pure. `new` when there was no previous ring; otherwise
 * `promoted` / `demoted` by rank, or `updated` when the ring is unchanged.
 */
export function classifyChangeType(
  ring: Ring,
  previousRing: Ring | undefined,
): 'new' | 'promoted' | 'demoted' | 'updated' {
  if (previousRing === undefined) return 'new';
  const delta = RING_RANK[ring] - RING_RANK[previousRing];
  if (delta > 0) return 'promoted';
  if (delta < 0) return 'demoted';
  return 'updated';
}

/** Re-export the ring order for consumers that need to iterate rings. */
export { RINGS };
