import { runIngest } from './orchestrator.js';
import { resolveProviders } from './resolve-providers.js';
import { recordSourceHealth } from './record-health.js';
import type { IngestResult, Logger } from './types.js';

// ---------------------------------------------------------------------------
// DB-driven ingest: resolve → run → record health
// ---------------------------------------------------------------------------

export interface RunIngestFromDbOptions {
  logger?: Logger;
  topic?: string;
  /** Injected SourceRepository (for health recording). */
  sourceRepository?: import('@digest/db').SourceRepository;
  /** Injected IngestRepository (for candidate persistence). */
  ingestRepository?: import('./types.js').IngestRepository;
}

/**
 * Full DB-driven ingest pipeline:
 *
 * 1. Resolve enabled sources from the DB into {@link SourceProvider}s.
 * 2. Run the ingest pipeline with those providers.
 * 3. Record per-source health back to the DB.
 * 4. Return the {@link IngestResult}.
 */
export async function runIngestFromDb(
  opts: RunIngestFromDbOptions = {},
): Promise<IngestResult> {
  const { logger, topic, sourceRepository, ingestRepository } = opts;

  const providers = await resolveProviders({ repository: sourceRepository, logger });

  const result = await runIngest({
    providers,
    logger,
    topic,
    repository: ingestRepository,
  });

  await recordSourceHealth(result, { repository: sourceRepository, logger });

  return result;
}
