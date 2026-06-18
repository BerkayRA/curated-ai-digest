/**
 * Curation job — triggers the weekly curation pipeline for the current ISO week.
 *
 * Resolves the Phase 7 wiring TODO: passes renderDigestEmail from @digest/email
 * as renderFn so the pipeline produces real HTML output.
 */

import { runWeeklyPipeline } from '@digest/curation';
import { renderDigestEmail } from '@digest/email';
import type { Logger } from '../logger.js';

export interface CurationJobOptions {
  readonly logger: Logger;
  /**
   * ISO week string (e.g. "2026-W24").
   * Defaults to current week if not provided.
   */
  readonly isoWeek?: string;
}

/**
 * Runs the weekly curation pipeline for the current ISO week.
 * Creates a draft Issue that then awaits human approval (or auto-send).
 */
export async function runCurationJob(opts: CurationJobOptions): Promise<void> {
  const { logger, isoWeek } = opts;

  logger.info('job.curate.start', { isoWeek: isoWeek ?? 'current' });

  try {
    const result = await runWeeklyPipeline({
      isoWeek,
      renderFn: renderDigestEmail,
      logger: {
        info: (msg, meta) => logger.info(msg, meta),
        warn: (msg, meta) => logger.warn(msg, meta),
        error: (msg, meta) => logger.error(msg, meta),
      },
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
