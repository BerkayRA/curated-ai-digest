// ---------------------------------------------------------------------------
// @digest/curation — public API
// ---------------------------------------------------------------------------

// ---- Ingest ----------------------------------------------------------------
// Orchestrator
export { runIngest } from './ingest/orchestrator';
export type { IngestOptions } from './ingest/orchestrator';

// File-based repository (scan path — no DB dependency)
export { createFileRepository } from './ingest/file-repository';
export type { FileRepositoryOptions } from './ingest/file-repository';

// Candidate pool artifact contract
export {
  CANDIDATES_DIR_DEFAULT,
  LATEST_FILE,
  INDEX_FILE,
  storedCandidateSchema,
  toStored,
  serializeStored,
  parseStoredLine,
  readPool,
  writePool,
} from './ingest/candidate-file';
export type { StoredCandidate } from './ingest/candidate-file';

// Committed-pool import bridge (daily scan artifact → Postgres)
export { importCommittedCandidates } from './ingest/import-pool';
export type { ImportPoolOptions, ImportPoolResult } from './ingest/import-pool';

// Scan runner
export { runScan } from './scan/run-scan';
export type { RunScanOptions } from './scan/run-scan';

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
} from './ingest/types';

// Source providers (pluggable ingestion — ADR-0003)
export { defaultProviders, isRadarEnabled } from './ingest/providers';
export { rssProvider, createRssProvider } from './ingest/rss-source';
export type { RssProviderOptions } from './ingest/rss-source';
export { exaProvider, createExaProvider } from './ingest/exa-source';
export type { ExaProviderOptions } from './ingest/exa-source';
export {
  radarProvider,
  createRadarProvider,
  fetchRadarCandidates,
  parseRadarBody,
  mapEventToCandidate,
  slug,
  RADAR_CATEGORIES,
  RADAR_RINGS,
  RADAR_CHANGE_TYPES,
  DEFAULT_RADAR_FEED_URL,
  DEFAULT_RADAR_REPO_URL,
} from './ingest/radar-source';
export type {
  RadarProviderConfig,
  RadarProviderFactoryOptions,
  RadarCategory,
  RadarRing,
  RadarChangeType,
  RadarEvent,
  FetchImpl,
} from './ingest/radar-source';

// DB-driven ingestion wiring
export { resolveProviders } from './ingest/resolve-providers';
export type { ResolveProvidersOptions } from './ingest/resolve-providers';
export { recordSourceHealth } from './ingest/record-health';
export type { RecordSourceHealthOptions } from './ingest/record-health';
export { runIngestFromDb } from './ingest/run-ingest-from-db';
export type { RunIngestFromDbOptions } from './ingest/run-ingest-from-db';

// Feed source catalogue (consumers may want to read the list)
export { FEEDS, EXA_QUERIES, DEFAULT_TOPIC } from './ingest/sources';
export type { FeedDefinition } from './ingest/sources';

// Low-level utilities (useful for downstream stages)
export { canonicalizeUrl, contentHash } from './ingest/canonicalize';
export { deduplicateWithinRun, filterAgainstExisting, enrichCandidate } from './ingest/dedup';

// RSS helpers (exposed so workers can reuse parseFeedXml)
export { fetchAllFeeds, fetchFeed, parseFeedXml } from './ingest/rss-source';

// ---- Pipeline --------------------------------------------------------------
// Orchestrator
export { runWeeklyPipeline } from './pipeline/orchestrator';
export type { RunWeeklyPipelineOptions } from './pipeline/orchestrator';

// Stage functions (for use when stages need to be run individually)
// Stage 5 types (DigestItem, RenderFn) are exported for consumers who inject the render function
export { runRankStage } from './pipeline/stage1-rank';
export { runCurateStage } from './pipeline/stage2-curate';
export { runCopywriteStage } from './pipeline/stage3-copywrite';
export { runEditorQaStage } from './pipeline/stage4-editor-qa';
export { runRenderStage } from './pipeline/stage5-render';
export type {
  RenderFn,
  DigestItem as PipelineDigestItem,
  DigestEmailData as PipelineDigestEmailData,
  RenderedEmail as PipelineRenderedEmail,
} from './pipeline/stage5-render';

// Repository factory (for consumers who need to call pipeline stages directly)
export { createPipelinePrismaRepository } from './pipeline/repository';

// Config (model map + pricing — consumers may inspect or override)
export { MODEL_MAP, PRICING, calcCostUsd, MAX_QA_RETRIES } from './pipeline/config';
export type { PipelineStage } from './pipeline/config';

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
  TopicContext,
  AnthropicClient,
} from './pipeline/types';

// ---- Curate (LLM-free) -----------------------------------------------------
// Deterministic scoring/selection over scanned candidates — powers the manual
// picker and the heuristic auto-curate backup (no Anthropic/Exa, no API key).
export {
  recencyScore,
  sourceTierScore,
  topicScore,
  scoreCandidate,
  heuristicCurate,
  candidateToDraftItem,
  groupBySourceTopN,
  pickFirstUnused,
} from './curate/index';
export type {
  CandidateView,
  CandidateDraftItem,
  ScoreOptions,
  CurateOptions,
  SourceGroup,
} from './curate/index';
