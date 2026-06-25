/**
 * Dispatch service — loads an approved/scheduled Issue, renders per-recipient
 * emails, records Send rows, and transitions the Issue to sent or failed.
 *
 * Designed for injection of provider + repo + transitionFn so unit tests can
 * mock all I/O without hitting real DB or email infrastructure.
 */

import {
  prisma,
  createSubscriberTopicRepository,
  createTopicRepository,
} from '@digest/db';
import type { EmailProvider, EmailMessage } from '@digest/email';
import { createEmailProvider, renderDigestEmail } from '@digest/email';
import type { DigestEmailData, DigestItem } from '@digest/email';
import type { IssueStatus } from '@digest/shared';
import type { Issue, IssueItem, Settings, TopicRecipient } from '@digest/db';
import { randomUUID } from 'node:crypto';
import { transitionIssue } from './issue-transition.js';
import type { TransitionOptions, TransitionResult } from './issue-transition.js';
import { injectTrackingHooks } from './track.js';

// ---------------------------------------------------------------------------
// PII scrubbing
// ---------------------------------------------------------------------------

/** Regex matching common email address patterns. */
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.]+/g;

/**
 * Replaces email addresses in an error string with `[redacted]` before
 * persisting to the database so subscriber PII is not stored in Send.error.
 */
export function scrubPii(input: string): string {
  return input.replace(EMAIL_PATTERN, '[redacted]');
}

// ---------------------------------------------------------------------------
// Repository interface — injected so the worker / tests can substitute
// ---------------------------------------------------------------------------

export interface DispatchRepo {
  getIssueWithItems(issueId: string): Promise<(Issue & { items: IssueItem[] }) | null>;
  /** Active, per-topic dispatch recipients (global unsubscribed/bounced excluded). */
  getTopicRecipients(topicId: string): Promise<TopicRecipient[]>;
  /** Per-topic From/Reply-To overrides; null fields fall back to global Settings. */
  getTopicBranding(
    topicId: string,
  ): Promise<{ fromAddress: string | null; replyTo: string | null } | null>;
  getSettings(): Promise<Settings | null>;
  recordSend(data: {
    issueId: string;
    subscriberId: string;
    subscriberTopicId: string;
    trackToken: string;
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
  async getTopicRecipients(topicId) {
    return createSubscriberTopicRepository(prisma).findActiveRecipients(topicId);
  },
  async getTopicBranding(topicId) {
    const topic = await createTopicRepository(prisma).findById(topicId);
    if (!topic) {
      return null;
    }
    return { fromAddress: topic.fromAddress, replyTo: topic.replyTo };
  },
  async getSettings() {
    return prisma.settings.findFirst();
  },
  async recordSend({
    issueId,
    subscriberId,
    subscriberTopicId,
    trackToken,
    status,
    providerMessageId,
    error,
  }) {
    await prisma.send.create({
      data: {
        issueId,
        subscriberId,
        subscriberTopicId,
        trackToken,
        status,
        providerMessageId: providerMessageId ?? null,
        error: error !== undefined ? scrubPii(error) : null,
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
 * Dispatches an issue to all active recipients of the issue's topic.
 *
 * Flow:
 *  1. Load issue + items + topic recipients + settings
 *  2. Verify provider config
 *  3. For each recipient, build a personalised EmailMessage
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

  const recipients = await repo.getTopicRecipients(issue.topicId);
  if (recipients.length === 0) {
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

  // Resolve per-topic From/Reply-To once, falling back to global Settings.
  const branding = await repo.getTopicBranding(issue.topicId);
  const fromEmail = branding?.fromAddress ?? settings.fromAddress;
  const replyTo = branding?.replyTo ?? settings.replyTo;

  const senderAddress = 'Mega Bilgisayar Tic. Ltd. Şti, Ankara, Türkiye';

  // 3. Build per-recipient messages
  const messages: Array<{
    message: EmailMessage;
    recipient: TopicRecipient;
    trackToken: string;
  }> = await Promise.all(
    recipients.map(async (recipient) => {
      const unsubscribeUrl = buildUnsubscribeUrl(recipient.unsubscribeToken);
      const data = buildDigestEmailData(issue, unsubscribeUrl, senderAddress);
      const rendered = await renderDigestEmail(data);

      // One opaque tracking token per Send — links + open pixel resolve to it.
      const trackToken = randomUUID();
      const trackedHtml = injectTrackingHooks(
        rendered.html,
        trackToken,
        issue.items,
        APP_BASE_URL,
      );

      const headers: Record<string, string> = {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      };
      if (replyTo) {
        headers['Reply-To'] = replyTo;
      }

      const message: EmailMessage = {
        to: {
          email: recipient.email,
          name: recipient.displayName ?? undefined,
        },
        from: {
          email: fromEmail,
          name: 'Curated AI Digest',
        },
        subject: issue.subject,
        html: trackedHtml,
        text: rendered.text,
        headers,
      };

      return { message, recipient, trackToken };
    }),
  );

  // 4. Send batch
  let successCount = 0;
  let failureCount = 0;

  try {
    const results = await provider.sendBatch(messages.map((m) => m.message));

    await Promise.all(
      results.map(async (result, i) => {
        const { recipient, trackToken } = messages[i]!;
        await repo.recordSend({
          issueId,
          subscriberId: recipient.subscriberId,
          subscriberTopicId: recipient.subscriberTopicId,
          trackToken,
          status: 'sent',
          providerMessageId: result.providerMessageId,
        });
        successCount++;
      }),
    );
  } catch (batchError) {
    // Batch failed — record individual failures with PII scrubbed from error message
    const rawError = batchError instanceof Error ? batchError.message : String(batchError);
    for (const { recipient, trackToken } of messages) {
      await repo.recordSend({
        issueId,
        subscriberId: recipient.subscriberId,
        subscriberTopicId: recipient.subscriberTopicId,
        trackToken,
        status: 'failed',
        error: rawError,
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
    meta: { successCount, failureCount, totalRecipients: recipients.length },
  });

  return {
    totalRecipients: recipients.length,
    successCount,
    failureCount,
    issueStatus: targetStatus,
  };
}
