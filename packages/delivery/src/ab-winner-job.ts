/**
 * A/B winner-selection job.
 *
 * After the holdout window, this job tallies per-variant opens, picks the
 * winner by open rate, marks the issue completed, and dispatches the winning
 * subject to the remaining (non-test) recipients.
 *
 * Idempotent + no-op safe: only acts on issues whose abStatus is 'testing'
 * with at least one variant. Designed for injection (repo + dispatch) so it
 * can be unit-tested without a database or live email provider.
 */

import { prisma, createSubjectVariantRepository } from '@digest/db';
import type { SubjectVariantRepository } from '@digest/db';
import type { AbWinnerResult } from '@digest/shared';
import { dispatchIssue } from './dispatch';
import { selectWinner } from './ab-split';

/** Minimal structured logger (matches the worker's Logger shape). */
export interface AbWinnerLogger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
}

/** Injectable dispatch signature — defaults to the real dispatchIssue. */
export type AbDispatchFn = typeof dispatchIssue;

export interface RunAbWinnerJobOptions {
  readonly issueId: string;
  /** Injected repo — defaults to the Prisma-backed implementation. */
  readonly repo?: SubjectVariantRepository;
  /** Injected dispatch function — defaults to the real dispatchIssue. */
  readonly dispatch?: AbDispatchFn;
  /** Optional structured logger; no console output when absent. */
  readonly logger?: AbWinnerLogger;
}

/**
 * Selects the winning subject variant for an issue under test and sends it to
 * the remaining recipients. Returns null (no-op) when the issue is missing,
 * not in 'testing' status, or has no variants.
 */
export async function runAbWinnerJob(
  opts: RunAbWinnerJobOptions,
): Promise<AbWinnerResult | null> {
  const { issueId, logger } = opts;
  const repo = opts.repo ?? createSubjectVariantRepository(prisma);
  const dispatch = opts.dispatch ?? dispatchIssue;

  // Atomic compare-and-swap (testing → selecting): both checks AND claims the
  // issue in one UPDATE. A lost race returns null = safe no-op (no double-send).
  if (!(await repo.claimAbTesting(issueId))) {
    logger?.info('job.ab_winner.skip', { issueId, reason: 'not in testing state' });
    return null;
  }

  const variants = await repo.findByIssueId(issueId);
  if (variants.length === 0) {
    logger?.info('job.ab_winner.skip', { issueId, reason: 'no variants' });
    return null;
  }

  return finalizeWinner({ issueId, repo, dispatch, logger, variants });
}

/** Tally → select → complete → dispatch remainder. Kept separate to stay <50 lines. */
async function finalizeWinner(args: {
  issueId: string;
  repo: SubjectVariantRepository;
  dispatch: AbDispatchFn;
  logger?: AbWinnerLogger;
  variants: Array<{ variantIndex: number; subject: string }>;
}): Promise<AbWinnerResult> {
  const { issueId, repo, dispatch, logger, variants } = args;

  // The issue is already in 'selecting' (claimed atomically by the caller).
  const stats = await repo.getVariantStats(issueId);
  await repo.persistCounts(issueId, stats);
  const winnerVariantIndex = selectWinner(stats);

  await repo.setIssueAbStatus(issueId, 'completed', winnerVariantIndex);

  const winner = variants.find((v) => v.variantIndex === winnerVariantIndex);
  const winnerSubject = winner?.subject ?? variants[0]!.subject;

  logger?.info('job.ab_winner.selected', { issueId, winnerVariantIndex });

  const result = await dispatch(issueId, {
    overrideSubject: winnerSubject,
    actorId: 'worker:ab',
  });

  logger?.info('job.ab_winner.remainder_sent', {
    issueId,
    remainderSentCount: result.successCount,
  });

  return {
    winnerVariantIndex,
    winnerSubject,
    remainderSentCount: result.successCount,
  };
}
