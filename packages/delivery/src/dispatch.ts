/**
 * Dispatch service — loads an approved/scheduled Issue, renders per-recipient
 * emails, records Send rows, and transitions the Issue to sent or failed.
 *
 * Designed for injection of provider + repo + transitionFn so unit tests can
 * mock all I/O without hitting real DB or email infrastructure.
 */

import { prisma } from '@mega-bulten/db';
import type { EmailProvider, EmailMessage } from '@mega-bulten/email';
import { createEmailProvider, renderDigestEmail } from '@mega-bulten/email';
import type { DigestEmailData, DigestItem } from '@mega-bulten/email';
import type { IssueStatus } from '@mega-bulten/shared';
import type { Issue, IssueItem, Subscriber, Settings } from '@mega-bulten/db';
import { transitionIssue } from './issue-transition.js';
import type { TransitionOptions, TransitionResult } from './issue-transition.js';

// ---------------------------------------------------------------------------
// Repository interface — injected so the worker / tests can substitute
// ---------------------------------------------------------------------------

export interface DispatchRepo {
  getIssueWithItems(issueId: string): Promise<(Issue & { items: IssueItem[] }) | null>;
  getActiveSubscribers(): Promise<Subscriber[]>;
  getSettings(): Promise<Settings | null>;
  recordSend(data: {
    issueId: string;
    subscriberId: string;
    status: 'queued' | 'sent' | 'failed';
    providerMessageId?: string;
    error?: string;
  }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Default repo backed by Prisma
// ---------------------------------------------------------------------------

export const defaultDispatchRepo: DispatchRepo = {
  async getIssueWithItems(issueId) {
    return prisma.issue.findUnique({
      where: { id: issueId },
      include: { items: { orderBy: { order: 'asc' } } },
    });
  },
  async getActiveSubscribers() {
    return prisma.subscriber.findMany({ where: { status: 'active' } });
  },
  async getSettings() {
    return prisma.settings.findFirst();
  },
  async recordSend({ issueId, subscriberId, status, providerMessageId, error }) {
    await prisma.send.create({
      data: {
        issueId,
        subscriberId,
        status,
        providerMessageId: providerMessageId ?? null,
        error: error ?? null,
        sentAt: status === 'sent' ? new Date() : null,
      },
    });
  },
};

// ---------------------------------------------------------------------------
// Dispatch options
// ---------------------------------------------------------------------------

/** Injectable transition function — defaults to the Prisma-backed transitionIssue. */
export type TransitionFn = (opts: TransitionOptions) => Promise<TransitionResult>;

export interface DispatchOptions {
  /** Injected provider — defaults to one created from settings.activeProvider. */
  readonly provider?: EmailProvider;
  /** Injected repo — defaults to the Prisma-backed implementation. */
  readonly repo?: DispatchRepo;
  /** Actor id written to AuditLog on transition. */
  readonly actorId?: string;
  /**
   * Injected transition function — defaults to the real transitionIssue.
   * Pass a mock in tests to avoid hitting the database.
   */
  readonly transitionFn?: TransitionFn;
}

export interface DispatchResult {
  readonly totalRecipients: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly issueStatus: IssueStatus;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const APP_BASE_URL = process.env['APP_BASE_URL'] ?? 'http://localhost:3100';

function buildUnsubscribeUrl(token: string): string {
  return `${APP_BASE_URL}/unsubscribe?token=${encodeURIComponent(token)}`;
}

function buildDigestEmailData(
  issue: Issue & { items: IssueItem[] },
  unsubscribeUrl: string,
  senderAddress: string,
): DigestEmailData {
  const items = issue.items.map((item) => ({
    titleTr: item.titleTr,
    summaryTr: item.summaryTr,
    sourceUrl: item.sourceUrl,
    sourceName: item.sourceName,
  })) as DigestItem[];

  if (items.length < 2) {
    throw new Error(`Issue ${issue.id} has fewer than 2 items — cannot render email`);
  }

  const issueDate = issue.createdAt.toISOString().split('T')[0] ?? issue.createdAt.toISOString();

  return {
    subject: issue.subject,
    preheader: issue.preheader ?? '',
    issueDate,
    issueLabel: issue.isoWeek,
    items: (items.length >= 3
      ? [items[0]!, items[1]!, items[2]!]
      : [items[0]!, items[1]!]) as DigestEmailData['items'],
    unsubscribeUrl,
    senderAddress,
  };
}

// ---------------------------------------------------------------------------
// Main dispatch function
// ---------------------------------------------------------------------------

/**
 * Dispatches an issue to all active subscribers.
 *
 * Flow:
 *  1. Load issue + items + subscribers + settings
 *  2. Verify provider config
 *  3. For each subscriber, build a personalised EmailMessage
 *  4. sendBatch via provider
 *  5. Record Send rows
 *  6. Transition issue to 'sent' (or 'failed' if all sends failed)
 */
export async function dispatchIssue(
  issueId: string,
  opts: DispatchOptions = {},
): Promise<DispatchResult> {
  const repo = opts.repo ?? defaultDispatchRepo;
  const doTransition = opts.transitionFn ?? transitionIssue;

  // 1. Load data
  const issue = await repo.getIssueWithItems(issueId);
  if (!issue) {
    throw new Error(`Issue not found: ${issueId}`);
  }

  const settings = await repo.getSettings();
  if (!settings) {
    throw new Error('No settings row found — configure the application before sending');
  }

  const subscribers = await repo.getActiveSubscribers();
  if (subscribers.length === 0) {
    throw new Error('No active subscribers found — nothing to send');
  }

  // 2. Resolve provider
  const provider = opts.provider ?? createEmailProvider(settings.activeProvider);

  const configCheck = await provider.verifyConfig();
  if (!configCheck.ok) {
    throw new Error(
      `Email provider '${settings.activeProvider}' is not configured: ${configCheck.detail ?? 'unknown error'}`,
    );
  }

  const senderAddress = 'Mega Bilişim Teknolojileri A.Ş., Ankara, Türkiye';

  // 3. Build per-subscriber messages
  const messages: Array<{ message: EmailMessage; subscriberId: string }> = await Promise.all(
    subscribers.map(async (subscriber) => {
      const unsubscribeUrl = buildUnsubscribeUrl(subscriber.unsubscribeToken);
      const data = buildDigestEmailData(issue, unsubscribeUrl, senderAddress);
      const rendered = await renderDigestEmail(data);

      const message: EmailMessage = {
        to: {
          email: subscriber.email,
          name: subscriber.displayName ?? undefined,
        },
        from: {
          email: settings.fromAddress,
          name: 'Mega Bülten',
        },
        subject: issue.subject,
        html: rendered.html,
        text: rendered.text,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      };

      return { message, subscriberId: subscriber.id };
    }),
  );

  // 4. Send batch
  let successCount = 0;
  let failureCount = 0;

  try {
    const results = await provider.sendBatch(messages.map((m) => m.message));

    await Promise.all(
      results.map(async (result, i) => {
        const subscriberId = messages[i]!.subscriberId;
        await repo.recordSend({
          issueId,
          subscriberId,
          status: 'sent',
          providerMessageId: result.providerMessageId,
        });
        successCount++;
      }),
    );
  } catch (batchError) {
    // Batch failed — record individual failures
    for (const { subscriberId } of messages) {
      await repo.recordSend({
        issueId,
        subscriberId,
        status: 'failed',
        error: batchError instanceof Error ? batchError.message : String(batchError),
      });
      failureCount++;
    }
  }

  // 5. Transition issue
  const allFailed = failureCount > 0 && successCount === 0;
  const targetStatus: IssueStatus = allFailed ? 'failed' : 'sent';

  await doTransition({
    issueId,
    to: targetStatus,
    actorId: opts.actorId ?? 'system',
    meta: { successCount, failureCount, totalRecipients: subscribers.length },
  });

  return {
    totalRecipients: subscribers.length,
    successCount,
    failureCount,
    issueStatus: targetStatus,
  };
}
