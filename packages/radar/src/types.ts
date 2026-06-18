// ---------------------------------------------------------------------------
// @mega-bulten/radar — core types
//
// The Mega Radar is an LLM-optional, topic-configurable deterministic news
// radar. These types describe the deterministic pipeline:
//
//   collect → normalize → score → ring-classify → emit
//
// Enums (categories, rings, change types) and the emitted RadarEvent shape are
// VERBATIM from docs/RADAR-DATA-CONTRACT.md so our radar's output is consumable
// by the existing `radar` SourceProvider in @mega-bulten/curation with no code
// changes. See docs/RFC-001-mega-radar.md for the full design.
// ---------------------------------------------------------------------------

// ---- Enums (verbatim from the data contract) ------------------------------

/** The 9 radar categories. */
export const CATEGORIES = [
  'coding_agents',
  'general_agents',
  'mcp_tooling',
  'sandbox_governance',
  'agent_frameworks',
  'model_serving',
  'ai_infrastructure',
  'physical_ai_infrastructure',
  'fun_experimental',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Adoption rings, ordered by rank: avoid(0) < watch(1) < pilot(2) < adopt(3). */
export const RINGS = ['avoid', 'watch', 'pilot', 'adopt'] as const;
export type Ring = (typeof RINGS)[number];

/** Numeric rank of each ring (higher = more adopted). */
export const RING_RANK: Readonly<Record<Ring, number>> = {
  avoid: 0,
  watch: 1,
  pilot: 2,
  adopt: 3,
};

/** Ring-change types emitted per project per run. */
export const CHANGE_TYPES = ['new', 'promoted', 'demoted', 'updated'] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

/** Seed-source kinds (mirror of seed-sources.yaml `type`). */
export const SOURCE_TYPES = ['github_repo', 'rss', 'manual'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

// ---- The 7 scoring dimensions ---------------------------------------------

/**
 * The 7 deterministic scoring dimensions. `setup_friction` is scored inverted
 * (low friction ⇒ high score) so every dimension is "higher is better".
 */
export const DIMENSIONS = [
  'workflow_impact',
  'laptop_runnability',
  'open_source_maturity',
  'on_prem_relevance',
  'security_posture',
  'demo_value',
  'setup_friction',
] as const;

export type Dimension = (typeof DIMENSIONS)[number];

/** A complete set of per-dimension scores, each in the range [0, 1]. */
export type DimensionScores = Record<Dimension, number>;

/** Normalized weights over the 7 dimensions; they sum to 1. */
export type DimensionWeights = Record<Dimension, number>;

// ---- Source / signal / scored-signal --------------------------------------

/** Optional package-registry pointer for a tracked project. */
export interface PackagePointer {
  readonly ecosystem: string;
  readonly name: string;
}

/** Optional backer metadata for a tracked project. */
export interface Backer {
  readonly name: string;
  readonly type: 'big_tech' | 'startup' | 'community' | 'individual' | 'academic';
}

/**
 * A configured seed source — one tracked project. Mirrors a single entry in
 * seed-sources.yaml plus our additions. The runtime/validated shape is inferred
 * from the Zod schema in config.ts; this interface is the hand-written mirror
 * used throughout the pipeline.
 */
export interface RadarSource {
  readonly id: string;
  readonly type: SourceType;
  readonly enabled: boolean;
  readonly project: string;
  readonly category: Category;
  readonly url: string;
  readonly tags: readonly string[];
  readonly package?: PackagePointer;
  readonly backer?: Backer;
  readonly firehose: boolean;
  readonly aliases: readonly string[];
}

/**
 * A raw signal produced by a collector for one project in one run, before
 * scoring. Holds the deterministic evidence the scorer consumes. The previous
 * ring (if any) is attached during normalization for change detection.
 */
export interface RawSignal {
  readonly sourceId: string;
  readonly project: string;
  readonly category: Category;
  /** Per-project deep-link/source URL (e.g. the repo or release page). */
  readonly url: string;
  /** Human-readable evidence lines (release-note highlights, etc.). */
  readonly evidence: readonly string[];
  /** Raw collector metrics consumed by the scorer (stars, downloads, ...). */
  readonly metrics: Readonly<Record<string, number>>;
  /** The project's ring from the previous run, if known (for change detection). */
  readonly previousRing?: Ring;
  /** When this signal was observed (run timestamp), ISO-8601 UTC. */
  readonly observedAt: string;
}

/**
 * A signal after deterministic scoring: per-dimension scores plus the composite
 * weighted-sum score, ready for ring classification.
 */
export interface ScoredSignal extends RawSignal {
  readonly scores: DimensionScores;
  /** Composite score in [0, 1] = normalized weighted sum of `scores`. */
  readonly score: number;
}

// ---- Emitted event (the contract surface) ----------------------------------

/**
 * A ring-change event — the unit emitted to history.jsonl / changes.json.
 * Field names are snake_case and VERBATIM from docs/RADAR-DATA-CONTRACT.md
 * (`ProjectHistoryEvent`) so the existing curation `radar` provider can parse
 * our output unchanged.
 */
export interface RadarEvent {
  readonly project: string;
  readonly category: Category;
  readonly change_type: ChangeType;
  readonly ring: Ring;
  /** null for a `new` event. */
  readonly previous_ring: Ring | null;
  readonly run_id: string;
  /** ISO-8601 UTC. */
  readonly observed_at: string;
  /** First line = ring-move sentence; rest = evidence highlights. */
  readonly reasons: readonly string[];
}

// ---- Ring-classification config --------------------------------------------

/** Absolute gate for a single ring: a signal must clear ALL listed minimums. */
export interface RingGate {
  readonly minScore: number;
  readonly minOpenSourceMaturity?: number;
  readonly minSecurityPosture?: number;
}

/** Gates for the three positive rings (below `watch` ⇒ `avoid`). */
export interface RingGates {
  readonly adopt: RingGate;
  readonly pilot: RingGate;
  readonly watch: RingGate;
}

// ---- Pipeline component interfaces -----------------------------------------

/**
 * Injectable logger (matches the curation package's Logger shape so the two can
 * share a concrete implementation).
 */
export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

/** A non-fatal error captured by a collector or pipeline stage. */
export interface RadarError {
  readonly source: string;
  readonly message: string;
}

/** What a collector returns: raw signals plus any non-fatal errors. */
export interface CollectResult {
  readonly signals: readonly RawSignal[];
  readonly errors: readonly RadarError[];
}

/**
 * A deterministic, LLM-free collector. Implement per source type
 * (GitHub releases, package registries, RSS). Must isolate per-item failures
 * into `errors` rather than throwing.
 */
export interface Collector {
  readonly id: string;
  /** Handles only sources whose `type` matches this collector. */
  readonly handles: SourceType;
  collect(sources: readonly RadarSource[], runId: string): Promise<CollectResult>;
}

/** A pure deterministic scorer: no I/O, no clock, no randomness. */
export interface Scorer {
  score(signal: RawSignal, weights: DimensionWeights): ScoredSignal;
}

/** A pure deterministic ring classifier. */
export interface RingClassifier {
  classify(score: number, gates: RingGates): Ring;
}

/** The result of a full radar run. */
export interface RadarResult {
  readonly runId: string;
  readonly observedAt: string;
  readonly events: readonly RadarEvent[];
  readonly errors: readonly RadarError[];
}
