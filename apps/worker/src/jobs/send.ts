/**
 * Send job — dispatches the current week's issue on send day/time.
 *
 * Decision logic:
 *   1. Load the current ISO week's Issue.
 *   2. If status is 'approved' or 'scheduled' → dispatch immediately.
 *   3. Else if Settings.autoSendEnabled and status is 'draft' or 'in_review':
 *      a. Run evaluateAutoSend guardrails.
 *      b. If canSend → dispatch (marks autoSent=true on the Issue row).
 *      c. If !canSend → log blocking reasons and leave as draft (alert).
 *   4. If status is 'sent' or 'cancelled' or 'failed' → no-op.
 *   5. If no issue exists for the week → log a warning and return.
 */

import { prisma, createSubscriberTopicRepository, createSubjectVariantRepository } from '@digest/db';
import type { IssueStatus } from '@digest/shared';
import { dispatchIssue, evaluateAutoSend, transitionIssue, scrubPii } from '@digest/delivery';
import { createEmailProvider } from '@digest/email';
import type { Logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Repository interface — injectable for tests
// ---------------------------------------------------------------------------

export interface SendJobRepo {
  findIssueByWeek(
    topicId: string,
    isoWeek: string,
  ): Promise<{
    id: string;
    status: IssueStatus;
    items: Array<{ id: string; qaFlags: unknown }>;
  } | null>;
  /** Active recipient count scoped to the topic being dispatched. */
  getActiveSubscriberCount(topicId: string): Promise<number>;
  getSettings(): Promise<{
    autoSendEnabled: boolean;
    activeProvider: string;
  } | null>;
  markAutoSent(issueId: string): Promise<void>;
  /** Whether the issue has A/B subject variants (governs test-fraction dispatch). */
  hasVariants(issueId: string): Promise<boolean>;
  /** Marks the issue's A/B lifecycle status (used after a test-fraction send). */
  setAbTesting(issueId: string): Promise<void>;
}

export const defaultSendJobRepo: SendJobRepo = {
  async findIssueByWeek(topicId, isoWeek) {
    // Select the issue via the (topicId, isoWeek) composite unique.
    const issue = await prisma.issue.findUnique({
      where: { topicId_isoWeek: { topicId, isoWeek } },
      select: {
        id: true,
        status: true,
        items: { select: { id: true, qaFlags: true } },
      },
    });
    if (!issue) return null;
    return {
      id: issue.id,
      status: issue.status as IssueStatus,
      items: issue.items.map((item) => ({ id: item.id, qaFlags: item.qaFlags })),
    };
  },
  async getActiveSubscriberCount(topicId) {
    return createSubscriberTopicRepository(prisma).countByTopicId(topicId);
  },
  async getSettings() {
    const s = await prisma.settings.findFirst();
    if (!s) return null;
    return {
      autoSendEnabled: s.autoSendEnabled,
      activeProvider: s.activeProvider,
    };
  },
  async markAutoSent(issueId) {
    await prisma.issue.update({
      where: { id: issueId },
      data: { autoSent: true },
    });
  },
  async hasVariants(issueId) {
    const count = await prisma.subjectVariant.count({ where: { issueId } });
    return count > 0;
  },
  async setAbTesting(issueId) {
    await createSubjectVariantRepository(prisma).setIssueAbStatus(issueId, 'testing');
  },
};

// ---------------------------------------------------------------------------
// Job options
// ---------------------------------------------------------------------------

export interface SendJobOptions {
  readonly logger: Logger;
  readonly topicId: string;
  readonly isoWeek: string;
  /**
   * Per-topic auto-send flag, already resolved (topic value ?? global) by the
   * scheduler. Governs whether draft/in_review issues may be auto-dispatched.
   */
  readonly autoSendEnabled: boolean;
  readonly repo?: SendJobRepo;
  /**
   * Alert hook called when auto-send is blocked. Worker logs the blocking
   * reasons; pass an override here for testing or extended alerting.
   */
  readonly onAutoSendBlocked?: (issueId: string, reasons: readonly string[]) => void;
}

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

/**
 * Dispatches an issue, splitting on A/B subject variants when present.
 *
 * When the issue has variants, only the test-fraction recipients are sent now
 * (the remainder + winner are handled later by the A/B winner job) and the
 * issue's abStatus is moved to 'testing'. Otherwise a single full dispatch runs
 * exactly as before.
 */
async function dispatchWithAbSplit(
  issueId: string,
  actorId: string,
  repo: SendJobRepo,
  logger: Logger,
): Promise<void> {
  const hasVariants = await repo.hasVariants(issueId);
  if (!hasVariants) {
    await dispatchIssue(issueId, { actorId });
    return;
  }

  logger.info('job.send.ab_test', { issueId });
  // A test-fraction dispatch that throws would otherwise leave the issue stuck
  // mid-flight (never moved to 'testing', never failed). Transition it to
  // 'failed' so the issue is not silently orphaned, then rethrow for the cron.
  try {
    await dispatchIssue(issueId, { actorId, testFractionOnly: true });
    await repo.setAbTesting(issueId);
  } catch (error) {
    await failIssue(issueId, actorId, error, logger);
    throw error;
  }
}

/** Best-effort transition to 'failed'; never masks the original dispatch error. */
async function failIssue(
  issueId: string,
  actorId: string,
  error: unknown,
  logger: Logger,
): Promise<void> {
  const message = scrubPii(error instanceof Error ? error.message : String(error));
  try {
    await transitionIssue({ issueId, to: 'failed', actorId, meta: { error: message } });
  } catch (transitionError) {
    logger.error('job.send.ab_fail_transition_error', {
      issueId,
      message: transitionError instanceof Error ? transitionError.message : String(transitionError),
    });
  }
}

/**
 * Runs the send job for the given ISO week.
 * All state decisions are made synchronously; dispatch is the only async side effect.
 */
export async function runSendJob(opts: SendJobOptions): Promise<void> {
  const { logger, topicId, isoWeek, autoSendEnabled, repo = defaultSendJobRepo } = opts;

  logger.info('job.send.start', { topicId, isoWeek });

  const issue = await repo.findIssueByWeek(topicId, isoWeek);
  if (!issue) {
    logger.warn('job.send.no_issue', { topicId, isoWeek });
    return;
  }

  const { id: issueId, status } = issue;

  // Terminal statuses — nothing to do
  if (status === 'sent' || status === 'cancelled' || status === 'failed') {
    logger.info('job.send.skip', { issueId, status, reason: 'terminal status' });
    return;
  }

  // Human-approved: dispatch immediately
  if (status === 'approved' || status === 'scheduled') {
    logger.info('job.send.dispatch', { issueId, status });
    await dispatchWithAbSplit(issueId, 'worker', repo, logger);
    logger.info('job.send.dispatched', { issueId });
    return;
  }

  // Draft / in_review — only proceed if auto-send is enabled for this topic
  // (resolved by the scheduler as topic value ?? global Settings).
  if (!autoSendEnabled) {
    logger.info('job.send.skip', {
      issueId,
      status,
      reason: 'auto-send disabled; awaiting human approval',
    });
    return;
  }

  // Settings still needed for the active provider (and to confirm config exists).
  const settings = await repo.getSettings();
  if (!settings) {
    logger.info('job.send.skip', {
      issueId,
      status,
      reason: 'no settings row; cannot resolve provider',
    });
    return;
  }

  // Run guardrails
  const activeSubscriberCount = await repo.getActiveSubscriberCount(topicId);
  const activeProvider = settings.activeProvider;

  let providerOk = false;
  let providerDetail: string | undefined;
  try {
    // createEmailProvider reads env vars; cast is safe because Settings stores valid kinds
    const provider = createEmailProvider(activeProvider as Parameters<typeof createEmailProvider>[0]);
    const check = await provider.verifyConfig();
    providerOk = check.ok;
    providerDetail = check.detail;
  } catch {
    providerOk = false;
    providerDetail = 'Failed to instantiate provider';
  }

  const guardrailResult = evaluateAutoSend({
    items: issue.items,
    providerOk,
    providerDetail,
    activeSubscriberCount,
  });

  if (!guardrailResult.canSend) {
    logger.warn('job.send.autosend_blocked', {
      issueId,
      reasons: guardrailResult.reasons,
    });
    const alertFn =
      opts.onAutoSendBlocked ??
      ((id, reasons) => {
        logger.warn('job.send.alert', { issueId: id, reasons });
      });
    alertFn(issueId, guardrailResult.reasons);
    return;
  }

  // Guardrails passed — mark autoSent and dispatch
  logger.info('job.send.autosend', { issueId });
  await repo.markAutoSent(issueId);
  await dispatchWithAbSplit(issueId, 'worker:auto', repo, logger);
  logger.info('job.send.dispatched', { issueId, autoSent: true });
}
