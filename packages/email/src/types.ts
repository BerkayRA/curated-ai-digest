/**
 * Email template prop types for @digest/email.
 *
 * DigestEmailData is the top-level data contract for the weekly digest template.
 * Item shapes are intentionally aligned with CreateIssueItemDto from @digest/shared,
 * but kept independent so email rendering has no runtime dep on Zod or Prisma.
 */

/**
 * A single curated news item rendered inside the digest.
 *
 * NOTE: `titleTr`/`summaryTr` are legacy field names — they hold the marketing
 * copy in the topic's content language, which is English for `language: 'en'`
 * topics. The `Tr` suffix is historical, not an assertion about the language;
 * the parent topic's `language` determines the actual content language.
 */
export interface DigestItem {
  /** Marketing title in the topic's content language (from Stage 3 copywriting). */
  readonly titleTr: string;
  /** Marketing summary in the topic's content language (from Stage 3 copywriting). */
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
  /**
   * Absolute base URL for email image assets (e.g. the wordmark). Defaults to
   * process.env.APP_BASE_URL at render time. Images are referenced (not embedded),
   * so the web app must be reachable here when the recipient opens the email.
   */
  readonly assetBaseUrl?: string;

  // --- Phase 5: per-topic white-label + language (all optional → Mega/TR defaults) ---
  /** Content language for structural copy + date locale ('tr' | 'en'); default 'tr'. */
  readonly language?: 'tr' | 'en';
  /** Per-topic logo URL; null/undefined → the Mega white wordmark. */
  readonly brandLogoUrl?: string | null;
  /** Per-topic accent color (hex); null/undefined → the Process-Blue brand color. */
  readonly brandColorHex?: string | null;
  /** Per-topic display wordmark; null/undefined → "Curated AI Digest". */
  readonly brandName?: string | null;
  /** Per-topic footer descriptor; null/undefined → the default Turkish descriptor. */
  readonly brandFooterText?: string | null;
}

/** Output of renderDigestEmail(). */
export interface RenderedEmail {
  readonly html: string;
  readonly text: string;
}

/** Top-level props for the ConfirmEmail (double opt-in) template. */
export interface ConfirmEmailData {
  /** Display name of the topic the recipient is confirming. */
  readonly topicName: string;
  /** Absolute confirm URL (e.g. `${APP_BASE_URL}/confirm/<token>`). */
  readonly confirmUrl: string;
  /** Physical sender address line shown in the footer (compliance). */
  readonly senderAddress: string;
  /** Absolute base URL for email image assets; defaults to APP_BASE_URL at render time. */
  readonly assetBaseUrl?: string;
}
