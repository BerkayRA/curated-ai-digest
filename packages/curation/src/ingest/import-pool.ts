/**
 * importCommittedCandidates
 *
 * Reads the committed candidate-pool artifact from disk and persists it into
 * Postgres via the IngestRepository.  Designed to run immediately BEFORE the
 * weekly curation pipeline so fresh scan results reach the curation stage.
 *
 * Key design decisions:
 * - Missing / empty artifact is a benign no-op (returns early, no throw).
 * - Prisma / @digest/db is loaded LAZILY via dynamic import so importing this
 *   module in tests never eagerly initialises the DB client.
 * - Callers inject a repository for full testability; production callers omit
 *   it and get the real Prisma-backed repo.
 */

import * as path from 'node:path';
import { readPool, CANDIDATES_DIR_DEFAULT } from './candidate-file.js';
import type { IngestRepository, Logger, EnrichedCandidate } from './types.js';
import type { StoredCandidate } from './candidate-file.js';

// ---------------------------------------------------------------------------
// Public option types
// ---------------------------------------------------------------------------

export interface ImportPoolOptions {
  /**
   * Directory that contains `latest.jsonl`.
   * Defaults to `CANDIDATES_DIR_DEFAULT` resolved from `process.cwd()`.
   */
  readonly dir?: string;

  /**
   * Override the repository (required in tests; omit in production).
   * When omitted the real Prisma-backed repository is loaded lazily.
   */
  readonly repository?: IngestRepository;

  /**
   * Injectable logger.  Defaults to a no-op silent logger.
   */
  readonly logger?: Logger;
}

export interface ImportPoolResult {
  /** Total records found in the pool file (0 when missing). */
  readonly poolSize: number;
  /** Candidates forwarded to persistRun (same as poolSize when the file existed). */
  readonly imported: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const silentLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function storedToEnriched(stored: StoredCandidate): EnrichedCandidate {
  const publishedAt =
    stored.publishedAt != null ? new Date(stored.publishedAt) : undefined;

  const enriched: EnrichedCandidate = {
    title: stored.title,
    sourceUrl: stored.sourceUrl,
    sourceName: stored.sourceName,
    rawExcerpt: stored.rawExcerpt,
    publishedAt,
    canonicalUrl: stored.canonicalUrl,
    contentHash: stored.contentHash,
  };

  return enriched;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Import the committed candidate pool artifact into Postgres.
 *
 * @returns `{ poolSize, imported }` — both are 0 when the artifact is missing.
 */
export async function importCommittedCandidates(
  opts: ImportPoolOptions = {},
): Promise<ImportPoolResult> {
  const logger = opts.logger ?? silentLogger;
  const dir =
    opts.dir ?? path.resolve(process.cwd(), CANDIDATES_DIR_DEFAULT);

  logger.info('import-pool.start', { dir });

  const pool = await readPool(dir);

  if (pool.length === 0) {
    logger.warn('import-pool.empty', { dir });
    return { poolSize: 0, imported: 0 };
  }

  const repo: IngestRepository =
    opts.repository ??
    (await import('./repository.js')).createPrismaRepository();

  const candidates: readonly EnrichedCandidate[] = pool.map(storedToEnriched);

  // Pre-filter against rows already in the DB so the IngestRun audit log reflects
  // only genuinely-new candidates. The article upsert is idempotent regardless,
  // but re-importing the full pool every day would otherwise log phantom ingests.
  const [existingUrls, existingHashes] = await Promise.all([
    repo.findExistingUrls(candidates.map((c) => c.canonicalUrl)),
    repo.findExistingHashes(candidates.map((c) => c.contentHash)),
  ]);
  const fresh = candidates.filter(
    (c) => !existingUrls.has(c.canonicalUrl) && !existingHashes.has(c.contentHash),
  );

  if (fresh.length === 0) {
    logger.info('import-pool.up-to-date', { poolSize: pool.length });
    return { poolSize: pool.length, imported: 0 };
  }

  await repo.persistRun({ source: 'committed-pool', candidates: fresh, errors: [] });

  logger.info('import-pool.done', { poolSize: pool.length, imported: fresh.length });

  return { poolSize: pool.length, imported: fresh.length };
}
