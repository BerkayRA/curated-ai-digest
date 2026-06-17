/**
 * Email template prop types for @mega-bulten/email.
 *
 * DigestEmailData is the top-level data contract for the weekly digest template.
 * Item shapes are intentionally aligned with CreateIssueItemDto from @mega-bulten/shared,
 * but kept independent so email rendering has no runtime dep on Zod or Prisma.
 */

/** A single curated news item rendered inside the digest. */
export interface DigestItem {
  /** Turkish marketing title (from Stage 3 copywriting). */
  readonly titleTr: string;
  /** Turkish marketing summary (from Stage 3 copywriting). */
  readonly summaryTr: string;
  /** Canonical URL of the source article. */
  readonly sourceUrl: string;
  /** Display name of the publication / source. */
  readonly sourceName: string;
}

/** Top-level props for the DigestEmail template. */
export interface DigestEmailData {
  /** Email subject line — rendered in <title> and as the issue heading. */
  readonly subject: string;
  /** Short preview text (shown by email clients before the body). */
  readonly preheader: string;
  /** ISO-8601 date string (e.g. "2026-06-16") used for the issue date display. */
  readonly issueDate: string;
  /** Issue number or label (e.g. "#42" or "Haziran 2026"). */
  readonly issueLabel: string;
  /** Curated items — 2 or 3 items per digest. */
  readonly items: readonly [DigestItem, DigestItem] | readonly [DigestItem, DigestItem, DigestItem];
  /**
   * Unsubscribe URL placeholder — use literal "{{unsubscribeUrl}}" in
   * the fixture; the worker substitutes real per-subscriber tokens at send time.
   * List-Unsubscribe header: set `List-Unsubscribe: <{{unsubscribeUrl}}>` and
   * `List-Unsubscribe-Post: List-Unsubscribe=One-Click` on the outbound message.
   */
  readonly unsubscribeUrl: string;
  /** Physical address line shown in the footer (CAN-SPAM / GDPR compliance). */
  readonly senderAddress: string;
}

/** Output of renderDigestEmail(). */
export interface RenderedEmail {
  readonly html: string;
  readonly text: string;
}
