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

import { prisma } from '@digest/db';
import type { IssueStatus } from '@digest/shared';
import { dispatchIssue, evaluateAutoSend } from '@digest/delivery';
import { createEmailProvider } from '@digest/email';
import type { Logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Repository interface — injectable for tests
// ---------------------------------------------------------------------------

export interface SendJobRepo {
  findIssueByWeek(
    isoWeek: string,
  ): Promise<{
    id: string;
    status: IssueStatus;
    items: Array<{ id: string; qaFlags: unknown }>;
  } | null>;
  getActiveSubscriberCount(): Promise<number>;
  getSettings(): Promise<{
    autoSendEnabled: boolean;
    activeProvider: string;
  } | null>;
  markAutoSent(issueId: string): Promise<void>;
}

export const defaultSendJobRepo: SendJobRepo = {
  async findIssueByWeek(isoWeek) {
    const issue = await prisma.issue.findUnique({
      where: { isoWeek },
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
  async getActiveSubscriberCount() {
    return prisma.subscriber.count({ where: { status: 'active' } });
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
};

// ---------------------------------------------------------------------------
// Job options
// ---------------------------------------------------------------------------

export interface SendJobOptions {
  readonly logger: Logger;
  readonly isoWeek: string;
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
 * Runs the send job for the given ISO week.
 * All state decisions are made synchronously; dispatch is the only async side effect.
 */
export async function runSendJob(opts: SendJobOptions): Promise<void> {
  const { logger, isoWeek, repo = defaultSendJobRepo } = opts;

  logger.info('job.send.start', { isoWeek });

  const issue = await repo.findIssueByWeek(isoWeek);
  if (!issue) {
    logger.warn('job.send.no_issue', { isoWeek });
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
    await dispatchIssue(issueId, { actorId: 'worker' });
    logger.info('job.send.dispatched', { issueId });
    return;
  }

  // Draft / in_review — only proceed if autoSendEnabled
  const settings = await repo.getSettings();
  if (!settings?.autoSendEnabled) {
    logger.info('job.send.skip', {
      issueId,
      status,
      reason: 'auto-send disabled; awaiting human approval',
    });
    return;
  }

  // Run guardrails
  const activeSubscriberCount = await repo.getActiveSubscriberCount();
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
  await dispatchIssue(issueId, { actorId: 'worker:auto' });
  logger.info('job.send.dispatched', { issueId, autoSent: true });
}
