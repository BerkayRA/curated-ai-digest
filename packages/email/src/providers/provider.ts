/**
 * Core provider interface and shared message types for @digest/email delivery.
 *
 * All concrete providers implement EmailProvider. The factory selects an
 * implementation at runtime; consumers interact only with this interface.
 */

import type { EmailProviderKind } from '@digest/shared';

// ---------------------------------------------------------------------------
// Shared message types
// ---------------------------------------------------------------------------

/** A single email recipient with an optional display name. */
export interface EmailRecipient {
  readonly email: string;
  readonly name?: string;
}

/**
 * The canonical message shape passed to every provider.
 *
 * headers: Pass through RFC-5322 and List-* headers verbatim.
 * Callers SHOULD include:
 *   "List-Unsubscribe": "<https://...>"
 *   "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
 */
export interface EmailMessage {
  readonly to: EmailRecipient;
  readonly from: EmailRecipient;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly headers?: Readonly<Record<string, string>>;
}

/** Successful outcome of a provider send call. */
export interface SendResult {
  /** Provider-assigned message/operation id for tracing. */
  readonly providerMessageId: string;
  /**
   * 'sent'   — provider confirmed delivery handoff immediately.
   * 'queued' — provider accepted the message but sends asynchronously.
   */
  readonly status: 'sent' | 'queued';
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/**
 * Pluggable email transport contract.
 *
 * Implementations MUST:
 *   - Read credentials from environment variables only (never hardcode).
 *   - Return { ok: false, detail } from verifyConfig() instead of throwing
 *     when configuration is absent.
 *   - Map sdk-level errors to thrown Error instances with descriptive messages.
 *   - Forward msg.headers to the underlying SDK's custom-header mechanism.
 */
export interface EmailProvider {
  readonly kind: EmailProviderKind;
  /** Send a single message. Throws on unrecoverable error. */
  send(msg: EmailMessage): Promise<SendResult>;
  /**
   * Send multiple messages, honoring the provider's rate and concurrency limits.
   * Results align 1-to-1 with the input array; a single message failure rejects
   * the entire batch (callers should wrap in try/catch for partial recovery).
   */
  sendBatch(msgs: readonly EmailMessage[]): Promise<SendResult[]>;
  /**
   * Probe the environment for required credentials and connectivity.
   * Returns { ok: true } when ready, { ok: false, detail: '...' } otherwise.
   * Never throws.
   */
  verifyConfig(): Promise<{ ok: boolean; detail?: string }>;
}

// ---------------------------------------------------------------------------
// Logger injection
// ---------------------------------------------------------------------------

/**
 * Minimal structured logger interface — never use console.log in library code.
 * Consumers inject a concrete logger (e.g. pino) via provider options.
 * Defaults to a no-op so the library is usable without wiring a logger.
 */
export interface ProviderLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export const noopLogger: ProviderLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
