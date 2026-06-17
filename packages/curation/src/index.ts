// ---------------------------------------------------------------------------
// @mega-bulten/curation — public API
// ---------------------------------------------------------------------------

// Orchestrator
export { runIngest } from './ingest/orchestrator.js';
export type { IngestOptions } from './ingest/orchestrator.js';

// Types
export type {
  RawCandidate,
  EnrichedCandidate,
  IngestResult,
  SourceError,
  Logger,
  IngestRepository,
  PersistRunOpts,
} from './ingest/types.js';

// Feed source catalogue (consumers may want to read the list)
export { FEEDS, EXA_QUERIES } from './ingest/sources.js';
export type { FeedDefinition } from './ingest/sources.js';

// Low-level utilities (useful for downstream stages)
export { canonicalizeUrl, contentHash } from './ingest/canonicalize.js';
export { deduplicateWithinRun, filterAgainstExisting, enrichCandidate } from './ingest/dedup.js';

// RSS helpers (exposed so workers can reuse parseFeedXml)
export { fetchAllFeeds, fetchFeed, parseFeedXml } from './ingest/rss-source.js';
