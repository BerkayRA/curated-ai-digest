/**
 * @digest/email — public API
 *
 * Email rendering pipeline entry point.
 */

// ---------------------------------------------------------------------------
// Phase 5 — rendering (DO NOT REMOVE — concurrently imported by other agents)
// ---------------------------------------------------------------------------

export { DigestEmail } from './templates/DigestEmail';
export { renderDigestEmail } from './render';
export type { DigestEmailData, DigestItem, RenderedEmail } from './types';

// i18n — structural string table for the email + archive (TR default).
export { getStrings, strings } from './i18n';
export type { EmailLang, EmailStrings } from './i18n';

// Transactional (double opt-in confirmation) — single-message send path.
export { ConfirmEmail } from './templates/ConfirmEmail';
export { renderConfirmEmail, sendTransactionalEmail } from './transactional';
export type { ConfirmEmailData } from './types';

// ---------------------------------------------------------------------------
// Phase 8 — delivery providers
// ---------------------------------------------------------------------------

// Core interface types
export type { EmailProvider, EmailMessage, EmailRecipient, SendResult, ProviderLogger } from './providers/provider';
export { noopLogger } from './providers/provider';

// Rate-limit utilities (exported for advanced consumers / testing)
export type { RateLimitOptions, RetryOptions, BatchSendOptions } from './providers/rate-limit';
export { sendBatchWithLimits, createPerMinuteLimiter } from './providers/rate-limit';

// Concrete providers
export { AcsEmailProvider } from './providers/acs';
export type { AcsEmailProviderOptions } from './providers/acs';

export { GraphEmailProvider } from './providers/graph';
export type { GraphEmailProviderOptions } from './providers/graph';

export { ResendEmailProvider } from './providers/resend';
export type { ResendEmailProviderOptions } from './providers/resend';

// Factory
export { createEmailProvider } from './providers/factory';
export type { ProviderOptions } from './providers/factory';
