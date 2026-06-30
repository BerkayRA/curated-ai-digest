/**
 * Curation job — triggers the weekly curation pipeline for the current ISO week.
 *
 * Before curating, it imports the committed candidate-pool artifact
 * (data/candidates/latest.jsonl, refreshed daily by the GitHub Actions scan)
 * into Postgres, so the freshest scan results are available to the pipeline.
 * A missing/failed import is non-fatal — the DB may already hold candidates.
 *
 * Resolves the Phase 7 wiring TODO: passes renderDigestEmail from @digest/email
 * as renderFn so the pipeline produces real HTML output.
 */

import { runWeeklyPipeline, importCommittedCandidates } from '@digest/curation';
import { renderDigestEmail } from '@digest/email';
import type { Logger } from '../logger';

export interface CurationJobOptions {
  readonly logger: Logger;
  /**
   * ISO week string (e.g. "2026-W24").
   * Defaults to current week if not provided.
   */
  readonly isoWeek?: string;
  /** Topic to curate. Passed through to the topic-aware pipeline. */
  readonly topicId?: string;
}

/**
 * Runs the weekly curation pipeline for the current ISO week.
 * Creates a draft Issue that then awaits human approval (or auto-send).
 */
export async function runCurationJob(opts: CurationJobOptions): Promise<void> {
  const { logger, isoWeek, topicId } = opts;

  logger.info('job.curate.start', { isoWeek: isoWeek ?? 'current', topicId });

  // Shared adapter so library code logs through the worker logger.
  const libLogger = {
    info: (msg: string, meta?: Record<string, unknown>) => logger.info(msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => logger.warn(msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => logger.error(msg, meta),
  };

  // Import the daily-refreshed candidate pool into Postgres first. CANDIDATES_DIR
  // points at the committed artifact in deployment; when unset, import-pool falls
  // back to its default (data/candidates relative to cwd). Never let a missing or
  // failed import abort the weekly run.
  try {
    const imported = await importCommittedCandidates({
      dir: process.env['CANDIDATES_DIR'],
      logger: libLogger,
    });
    logger.info('job.curate.pool-imported', {
      poolSize: imported.poolSize,
      imported: imported.imported,
    });
  } catch (error) {
    logger.warn('job.curate.pool-import-failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const result = await runWeeklyPipeline({
      isoWeek,
      topicId,
      renderFn: renderDigestEmail,
      logger: libLogger,
    });

    logger.info('job.curate.done', {
      issueId: result.issueId,
      isoWeek: result.isoWeek,
      itemCount: result.itemCount,
      qaFlagCount: result.qaFlags.length,
      costUsd: result.costUsd,
    });
  } catch (error) {
    logger.error('job.curate.error', {
      message: error instanceof Error ? error.message : String(error),
      isoWeek: isoWeek ?? 'current',
    });
    throw error;
  }
}
