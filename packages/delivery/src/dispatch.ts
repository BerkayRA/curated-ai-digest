/**
 * Dispatch service — loads an approved/scheduled Issue, renders per-recipient
 * emails, records Send rows, and transitions the Issue to sent or failed.
 *
 * Designed for injection of provider + repo + transitionFn so unit tests can
 * mock all I/O without hitting real DB or email infrastructure.
 */

import { prisma, createSubscriberTopicRepository, createTopicRepository } from '@digest/db';
import type { EmailProvider, EmailMessage } from '@digest/email';
import { createEmailProvider, renderDigestEmail } from '@digest/email';
import type { DigestEmailData, DigestItem } from '@digest/email';
import type { IssueStatus } from '@digest/shared';
import type { Issue, IssueItem, Settings, TopicRecipient } from '@digest/db';
import { randomUUID } from 'node:crypto';
import { transitionIssue } from './issue-transition.js';
import type { TransitionOptions, TransitionResult } from './issue-transition.js';
import { injectTrackingHooks } from './track.js';
import { assignVariant } from './ab-split.js';

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
  /** Per-topic From/Reply-To + white-label/language overrides; null fields fall back to defaults. */
  getTopicBranding(topicId: string): Promise<TopicBranding | null>;
  getSettings(): Promise<Settings | null>;
  /** A/B subject variants for an issue (empty → no test; the default path). */
  getSubjectVariants(issueId: string): Promise<SubjectVariantRow[]>;
  /** Of the given emails, the subset on the global suppression list. */
  isSuppressedBatch(emails: readonly string[]): Promise<Set<string>>;
  /** subscriberTopicIds that already received a Send for this issue (A/B remainder skip). */
  getAlreadySentRecipientIds(issueId: string): Promise<Set<string>>;
  recordSend(data: {
    issueId: string;
    subscriberId: string;
    subscriberTopicId: string;
    trackToken: string;
    status: 'queued' | 'sent' | 'failed';
    providerMessageId?: string;
    variantIndex?: number | null;
    error?: string;
  }): Promise<void>;
}

/** Per-topic From/Reply-To + white-label/language overrides; null → fall back to defaults. */
export interface TopicBranding {
  readonly fromAddress: string | null;
  readonly replyTo: string | null;
  readonly brandLogoUrl: string | null;
  readonly brandColorHex: string | null;
  readonly brandName: string | null;
  readonly brandFooterText: string | null;
  readonly language: string | null;
}

/** Minimal A/B variant shape the dispatcher needs (subject + split fraction). */
export interface SubjectVariantRow {
  readonly variantIndex: number;
  readonly subject: string;
  readonly testFraction: number;
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
    return {
      fromAddress: topic.fromAddress,
      replyTo: topic.replyTo,
      brandLogoUrl: topic.brandLogoUrl ?? null,
      brandColorHex: topic.brandColorHex ?? null,
      brandName: topic.brandName ?? null,
      brandFooterText: topic.brandFooterText ?? null,
      language: topic.language ?? null,
    };
  },
  async getSettings() {
    return prisma.settings.findFirst();
  },
  async getSubjectVariants(issueId) {
    const rows = await prisma.subjectVariant.findMany({
      where: { issueId },
      orderBy: { variantIndex: 'asc' },
      select: { variantIndex: true, subject: true, testFraction: true },
    });
    return rows;
  },
  async isSuppressedBatch(emails) {
    if (emails.length === 0) return new Set();
    const rows = await prisma.suppression.findMany({
      where: { email: { in: [...emails] } },
      select: { email: true },
    });
    return new Set(rows.map((r) => r.email));
  },
  async getAlreadySentRecipientIds(issueId) {
    const rows = await prisma.send.findMany({
      where: { issueId, subscriberTopicId: { not: null } },
      select: { subscriberTopicId: true },
    });
    return new Set(rows.flatMap((r) => (r.subscriberTopicId ? [r.subscriberTopicId] : [])));
  },
  async recordSend({
    issueId,
    subscriberId,
    subscriberTopicId,
    trackToken,
    status,
    providerMessageId,
    variantIndex,
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
        variantIndex: variantIndex ?? null,
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
  /**
   * A/B remainder send: overrides the per-recipient subject with the winning
   * variant's subject and records no variantIndex. Implies skipping recipients
   * who already received the test send.
   */
  readonly overrideSubject?: string;
  /**
   * A/B test send: only dispatch to the test-fraction recipients (the remainder
   * is sent later by the winner job). Ignored when no variants exist.
   */
  readonly testFractionOnly?: boolean;
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

/** Maps resolved branding (or null) to the optional DigestEmailData brand props. */
function resolveBrandProps(
  branding: TopicBranding | null,
): Pick<
  DigestEmailData,
  'language' | 'brandLogoUrl' | 'brandColorHex' | 'brandName' | 'brandFooterText'
> {
  return {
    language: branding?.language === 'en' ? 'en' : 'tr',
    brandLogoUrl: branding?.brandLogoUrl ?? undefined,
    brandColorHex: branding?.brandColorHex ?? undefined,
    brandName: branding?.brandName ?? undefined,
    brandFooterText: branding?.brandFooterText ?? undefined,
  };
}

function buildDigestEmailData(
  issue: Issue & { items: IssueItem[] },
  unsubscribeUrl: string,
  senderAddress: string,
  subject: string,
  branding: TopicBranding | null,
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
    subject,
    preheader: issue.preheader ?? '',
    issueDate,
    issueLabel: issue.isoWeek,
    items: (items.length >= 3
      ? [items[0]!, items[1]!, items[2]!]
      : [items[0]!, items[1]!]) as DigestEmailData['items'],
    unsubscribeUrl,
    senderAddress,
    ...resolveBrandProps(branding),
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

  const allRecipients = await repo.getTopicRecipients(issue.topicId);
  if (allRecipients.length === 0) {
    throw new Error('No active subscribers found — nothing to send');
  }

  // Global suppression firewall — exclude hard-bounced/complained/manual addresses
  // across ALL topics (distinct from per-topic unsubscribe). Empty list (the
  // default) removes nobody, so the legacy send path is unchanged.
  const suppressed = await repo.isSuppressedBatch(allRecipients.map((r) => r.email));
  let recipients = allRecipients.filter((r) => !suppressed.has(r.email));

  // A/B remainder send: skip recipients who already received the test send.
  if (opts.overrideSubject) {
    const alreadySent = await repo.getAlreadySentRecipientIds(issueId);
    recipients = recipients.filter((r) => !alreadySent.has(r.subscriberTopicId));
  }

  if (recipients.length === 0) {
    throw new Error('No eligible recipients — all suppressed or already sent for this issue');
  }

  // A/B variants for this issue. Empty (or an override/remainder send) → no split.
  const variants = opts.overrideSubject ? [] : await repo.getSubjectVariants(issueId);
  const variantCount = variants.length;
  const testFraction = variantCount > 0 ? (variants[0]?.testFraction ?? 0.5) : 0;

  // Pair each recipient with its assigned variant (null = remainder / no test).
  // Build pairs BEFORE any filtering so positions stay aligned with assignVariant.
  let dispatchList: Array<{ recipient: TopicRecipient; variantIndex: number | null }> =
    recipients.map((recipient, i) => ({
      recipient,
      variantIndex:
        variantCount > 0 ? assignVariant(i, recipients.length, testFraction, variantCount) : null,
    }));

  // In test mode, send only to the test-fraction recipients (remainder deferred
  // to the winner job).
  if (opts.testFractionOnly && variantCount > 0) {
    dispatchList = dispatchList.filter((d) => d.variantIndex !== null);
    if (dispatchList.length === 0) {
      throw new Error('A/B test fraction resolved to zero recipients');
    }
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

  const senderAddress =
    branding?.brandFooterText ?? 'Mega Bilgisayar Tic. Ltd. Şti, Ankara, Türkiye';

  // 3. Build per-recipient messages. Subject precedence:
  //    overrideSubject (A/B remainder) → assigned variant subject → issue.subject.
  const messages: Array<{
    message: EmailMessage;
    recipient: TopicRecipient;
    trackToken: string;
    variantIndex: number | null;
  }> = await Promise.all(
    dispatchList.map(async ({ recipient, variantIndex }) => {
      const subject =
        opts.overrideSubject ??
        (variantIndex !== null
          ? (variants[variantIndex]?.subject ?? issue.subject)
          : issue.subject);

      const unsubscribeUrl = buildUnsubscribeUrl(recipient.unsubscribeToken);
      const data = buildDigestEmailData(issue, unsubscribeUrl, senderAddress, subject, branding);
      const rendered = await renderDigestEmail(data);

      // One opaque tracking token per Send — links + open pixel resolve to it.
      const trackToken = randomUUID();
      const trackedHtml = injectTrackingHooks(rendered.html, trackToken, issue.items, APP_BASE_URL);

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
          name: branding?.brandName ?? 'Curated AI Digest',
        },
        subject,
        html: trackedHtml,
        text: rendered.text,
        headers,
      };

      return { message, recipient, trackToken, variantIndex };
    }),
  );

  // 4. Send batch
  let successCount = 0;
  let failureCount = 0;

  try {
    const results = await provider.sendBatch(messages.map((m) => m.message));

    await Promise.all(
      results.map(async (result, i) => {
        const { recipient, trackToken, variantIndex } = messages[i]!;
        await repo.recordSend({
          issueId,
          subscriberId: recipient.subscriberId,
          subscriberTopicId: recipient.subscriberTopicId,
          trackToken,
          status: 'sent',
          providerMessageId: result.providerMessageId,
          variantIndex,
        });
        successCount++;
      }),
    );
  } catch (batchError) {
    // Batch failed — record individual failures with PII scrubbed from error message
    const rawError = batchError instanceof Error ? batchError.message : String(batchError);
    for (const { recipient, trackToken, variantIndex } of messages) {
      await repo.recordSend({
        issueId,
        subscriberId: recipient.subscriberId,
        subscriberTopicId: recipient.subscriberTopicId,
        trackToken,
        status: 'failed',
        variantIndex,
        error: rawError,
      });
      failureCount++;
    }
  }

  // 5. Transition issue
  const allFailed = failureCount > 0 && successCount === 0;
  const targetStatus: IssueStatus = allFailed ? 'failed' : 'sent';

  // A/B test sends (testFractionOnly) intentionally leave the issue in its
  // current status — the winner job sends the remainder and finalizes it.
  // Otherwise transition to sent/failed as before.
  if (!opts.testFractionOnly || variantCount === 0) {
    await doTransition({
      issueId,
      to: targetStatus,
      actorId: opts.actorId ?? 'system',
      meta: { successCount, failureCount, totalRecipients: dispatchList.length },
    });
  }

  return {
    totalRecipients: dispatchList.length,
    successCount,
    failureCount,
    issueStatus: targetStatus,
  };
}
