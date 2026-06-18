// ---------------------------------------------------------------------------
// @mega-bulten/radar — public API
//
// Mega Radar: an LLM-optional, topic-configurable deterministic news radar.
// This is a SCAFFOLD (see docs/RFC-001-mega-radar.md). The config schema, types,
// emit serializers, and pure scoring/classify defaults are real; the collectors,
// persistence, the full classifier, and the optional LLM pass are later phases.
// ---------------------------------------------------------------------------

// ---- Types -----------------------------------------------------------------
export {
  CATEGORIES,
  RINGS,
  RING_RANK,
  CHANGE_TYPES,
  SOURCE_TYPES,
  DIMENSIONS,
} from './types.js';
export type {
  Category,
  Ring,
  ChangeType,
  SourceType,
  Dimension,
  DimensionScores,
  DimensionWeights,
  PackagePointer,
  Backer,
  RadarSource,
  RawSignal,
  ScoredSignal,
  RadarEvent,
  RingGate,
  RingGates,
  Logger,
  RadarError,
  CollectResult,
  Collector,
  Scorer,
  RingClassifier,
  RadarResult,
} from './types.js';

// ---- Config ----------------------------------------------------------------
export {
  radarConfigSchema,
  sourceConfigSchema,
  quotasConfigSchema,
  scoringConfigSchema,
  weightsConfigSchema,
  llmConfigSchema,
  parseRadarConfig,
  normalizeWeights,
  quotaForCategory,
} from './config.js';
export type {
  RadarConfig,
  SourceConfig,
  QuotasConfig,
  ScoringConfig,
  LlmConfig,
} from './config.js';

// ---- Scoring + classification ----------------------------------------------
export {
  scoreSignal,
  scoreDimensions,
  classifyRing,
  classifyChangeType,
} from './scoring.js';

// ---- Emit (contract-shaped serializers) ------------------------------------
export {
  toHistoryJsonl,
  toChangesJson,
  eventId,
  JSON_FEED_VERSION,
  CHANGES_FEED_MAX_ITEMS,
} from './emit.js';
export type { ChangesFeed, ChangesFeedItem } from './emit.js';

import type { RadarConfig } from './config.js';
import type { RadarResult } from './types.js';

/**
 * Run the full radar pipeline: collect → normalize → score → ring-classify →
 * emit. NOT YET IMPLEMENTED — this is the scaffold orchestrator stub.
 *
 * The signature is final (a validated {@link RadarConfig} in, a
 * {@link RadarResult} out); the body lands in later phases (P1–P4 in
 * docs/RFC-001-mega-radar.md). It deliberately throws so callers cannot mistake
 * the scaffold for a working pipeline.
 *
 * @throws Always, until the pipeline is implemented.
 */
export function runRadar(_config: RadarConfig): Promise<RadarResult> {
  throw new Error('not yet implemented — see docs/RFC-001-mega-radar.md (P1–P4)');
}
