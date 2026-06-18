// ---------------------------------------------------------------------------
// Ingest pipeline types
// ---------------------------------------------------------------------------

/** A raw candidate as produced by any source before dedup/persistence. */
export interface RawCandidate {
  readonly title: string;
  readonly sourceUrl: string;
  readonly sourceName: string;
  readonly rawExcerpt: string | undefined;
  readonly publishedAt: Date | undefined;
}

/** A candidate enriched with dedup hashes (computed after ingestion). */
export interface EnrichedCandidate extends RawCandidate {
  readonly canonicalUrl: string;
  readonly contentHash: string;
}

/** The final summary returned by runIngest(). */
export interface IngestResult {
  readonly ingestRunId: string;
  /** Total candidates fetched across all sources. */
  readonly fetched: number;
  /** Candidates remaining after within-run dedup. */
  readonly deduped: number;
  /** Candidates actually written to the DB (new rows). */
  readonly persisted: number;
  /** Non-fatal errors from individual sources. */
  readonly errors: readonly SourceError[];
  /** Raw candidate counts keyed by provider id (pre-dedup). */
  readonly bySource?: Record<string, number>;
}

export interface SourceError {
  readonly source: string;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Pluggable source providers (ADR-0003, decision 1)
// ---------------------------------------------------------------------------

/**
 * Context handed to every provider on each run.
 *
 * `topic` tunes provider queries (e.g. Exa search terms) and will later be
 * sourced from Settings; for now it defaults to {@link DEFAULT_TOPIC}.
 * `signal` is reserved for cancellation support and may be undefined.
 */
export interface SourceContext {
  readonly topic: string;
  readonly logger: Logger;
  readonly signal?: AbortSignal;
}

/** What a provider returns: candidates plus any non-fatal errors it collected. */
export interface SourceFetchResult {
  readonly candidates: readonly RawCandidate[];
  readonly errors: readonly SourceError[];
}

/**
 * A pluggable news source. Implement this interface and register it in
 * `providers.ts` to add a new source — no orchestrator changes required.
 *
 * `fetch` must isolate its own per-item failures into the returned `errors`
 * array; a thrown error is tolerated by the orchestrator but loses granularity.
 */
export interface SourceProvider {
  readonly id: string;
  readonly label: string;
  fetch(ctx: SourceContext): Promise<SourceFetchResult>;
}

/**
 * Injectable logger interface used by library code.
 * Consumers can pass console or a pino/winston instance.
 */
export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

/** Minimal repository surface needed by the orchestrator — mockable in tests. */
export interface IngestRepository {
  /** Returns the set of canonical URLs already in the DB. */
  findExistingUrls(urls: readonly string[]): Promise<Set<string>>;
  /** Returns the set of content hashes already in the DB. */
  findExistingHashes(hashes: readonly string[]): Promise<Set<string>>;
  /**
   * Creates an IngestRun row, bulk-upserts the candidates, marks the run
   * finished, and returns the run id.
   */
  persistRun(opts: PersistRunOpts): Promise<string>;
}

export interface PersistRunOpts {
  readonly source: string;
  readonly candidates: readonly EnrichedCandidate[];
  readonly errors: readonly SourceError[];
}
