// ---------------------------------------------------------------------------
// @mega-bulten/curation — public API
// ---------------------------------------------------------------------------

// ---- Ingest ----------------------------------------------------------------
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
  SourceContext,
  SourceFetchResult,
  SourceProvider,
} from './ingest/types.js';

// Source providers (pluggable ingestion — ADR-0003)
export { defaultProviders } from './ingest/providers.js';
export { rssProvider } from './ingest/rss-source.js';
export { exaProvider } from './ingest/exa-source.js';

// Feed source catalogue (consumers may want to read the list)
export { FEEDS, EXA_QUERIES, DEFAULT_TOPIC } from './ingest/sources.js';
export type { FeedDefinition } from './ingest/sources.js';

// Low-level utilities (useful for downstream stages)
export { canonicalizeUrl, contentHash } from './ingest/canonicalize.js';
export { deduplicateWithinRun, filterAgainstExisting, enrichCandidate } from './ingest/dedup.js';

// RSS helpers (exposed so workers can reuse parseFeedXml)
export { fetchAllFeeds, fetchFeed, parseFeedXml } from './ingest/rss-source.js';

// ---- Pipeline --------------------------------------------------------------
// Orchestrator
export { runWeeklyPipeline } from './pipeline/orchestrator.js';
export type { RunWeeklyPipelineOptions } from './pipeline/orchestrator.js';

// Stage functions (for use when stages need to be run individually)
// Stage 5 types (DigestItem, RenderFn) are exported for consumers who inject the render function
export { runRankStage } from './pipeline/stage1-rank.js';
export { runCurateStage } from './pipeline/stage2-curate.js';
export { runCopywriteStage } from './pipeline/stage3-copywrite.js';
export { runEditorQaStage } from './pipeline/stage4-editor-qa.js';
export { runRenderStage } from './pipeline/stage5-render.js';
export type {
  RenderFn,
  DigestItem as PipelineDigestItem,
  DigestEmailData as PipelineDigestEmailData,
  RenderedEmail as PipelineRenderedEmail,
} from './pipeline/stage5-render.js';

// Config (model map + pricing — consumers may inspect or override)
export { MODEL_MAP, PRICING, calcCostUsd, MAX_QA_RETRIES } from './pipeline/config.js';
export type { PipelineStage } from './pipeline/config.js';

// Types
export type {
  ScoredCandidate,
  CurateSelection,
  CopiedItem,
  CopywriteOutput,
  QaFlag,
  QaOutput,
  RenderOutput,
  PipelineResult,
  PipelineRunRecord,
  PipelineRepository,
  StageOptions,
  AnthropicClient,
} from './pipeline/types.js';
