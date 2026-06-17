import { fetchAllFeeds } from './rss-source.js';
import { fetchExaCandidates } from './exa-source.js';
import { deduplicateWithinRun, filterAgainstExisting } from './dedup.js';
import { createPrismaRepository } from './repository.js';
import type { IngestResult, IngestRepository, Logger, SourceError } from './types.js';

// ---------------------------------------------------------------------------
// Ingest orchestrator
// ---------------------------------------------------------------------------

export interface IngestOptions {
  /** Override the repository (useful in tests). */
  repository?: IngestRepository;
  /** Override the logger (useful in tests or workers). */
  logger?: Logger;
}

/** A no-op logger used when no logger is provided. */
const silentLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/**
 * Run the full ingest pipeline:
 * 1. Fetch from all RSS feeds + Exa (both sources run in parallel).
 * 2. Deduplicate within the run.
 * 3. Filter against candidates already in the DB.
 * 4. Persist new candidates and record an IngestRun.
 *
 * Non-fatal source errors are collected and included in the result; the
 * orchestrator itself never throws unless the DB write fails.
 */
export async function runIngest(opts: IngestOptions = {}): Promise<IngestResult> {
  const logger = opts.logger ?? silentLogger;
  const repo = opts.repository ?? createPrismaRepository();

  logger.info('ingest.start');

  // 1. Fetch from all sources in parallel.
  const [rssResult, exaResult] = await Promise.all([
    fetchAllFeeds(),
    fetchExaCandidates(logger),
  ]);

  const allErrors: SourceError[] = [...rssResult.errors, ...exaResult.errors];
  const allCandidates = [...rssResult.candidates, ...exaResult.candidates];

  logger.info('ingest.fetched', { count: allCandidates.length });

  // 2. Within-run dedup.
  const deduped = deduplicateWithinRun(allCandidates);

  logger.info('ingest.deduped', { count: deduped.length });

  // 3. Filter against DB.
  const urls = deduped.map((c) => c.canonicalUrl);
  const hashes = deduped.map((c) => c.contentHash);

  const [existingUrls, existingHashes] = await Promise.all([
    repo.findExistingUrls(urls),
    repo.findExistingHashes(hashes),
  ]);

  const newCandidates = filterAgainstExisting(deduped, existingUrls, existingHashes);

  logger.info('ingest.new', { count: newCandidates.length });

  // 4. Persist.
  const ingestRunId = await repo.persistRun({
    source: 'rss+exa',
    candidates: newCandidates,
    errors: allErrors,
  });

  logger.info('ingest.done', { ingestRunId, persisted: newCandidates.length });

  return {
    ingestRunId,
    fetched: allCandidates.length,
    deduped: deduped.length,
    persisted: newCandidates.length,
    errors: allErrors,
  };
}
