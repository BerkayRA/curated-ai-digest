/**
 * @digest/email — public API
 *
 * Email rendering pipeline entry point.
 */

// ---------------------------------------------------------------------------
// Phase 5 — rendering (DO NOT REMOVE — concurrently imported by other agents)
// ---------------------------------------------------------------------------

export { DigestEmail } from './templates/DigestEmail.js';
export { renderDigestEmail } from './render.js';
export type { DigestEmailData, DigestItem, RenderedEmail } from './types.js';

// Transactional (double opt-in confirmation) — single-message send path.
export { ConfirmEmail } from './templates/ConfirmEmail.js';
export { renderConfirmEmail, sendTransactionalEmail } from './transactional.js';
export type { ConfirmEmailData } from './types.js';

// ---------------------------------------------------------------------------
// Phase 8 — delivery providers
// ---------------------------------------------------------------------------

// Core interface types
export type { EmailProvider, EmailMessage, EmailRecipient, SendResult, ProviderLogger } from './providers/provider.js';
export { noopLogger } from './providers/provider.js';

// Rate-limit utilities (exported for advanced consumers / testing)
export type { RateLimitOptions, RetryOptions, BatchSendOptions } from './providers/rate-limit.js';
export { sendBatchWithLimits, createPerMinuteLimiter } from './providers/rate-limit.js';

// Concrete providers
export { AcsEmailProvider } from './providers/acs.js';
export type { AcsEmailProviderOptions } from './providers/acs.js';

export { GraphEmailProvider } from './providers/graph.js';
export type { GraphEmailProviderOptions } from './providers/graph.js';

export { ResendEmailProvider } from './providers/resend.js';
export type { ResendEmailProviderOptions } from './providers/resend.js';

// Factory
export { createEmailProvider } from './providers/factory.js';
export type { ProviderOptions } from './providers/factory.js';
