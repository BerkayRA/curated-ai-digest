/**
 * ResendEmailProvider — Resend.com email transport.
 *
 * Authentication:
 *   API key via RESEND_API_KEY environment variable.
 *
 * Rate-limit defaults:
 *   concurrency = 5, perMinute = 100 (Resend's free plan limit is 100/day;
 *   paid plans support higher rates — tune via options).
 *
 * Custom headers:
 *   Resend supports arbitrary headers via the `headers` field.
 *   List-Unsubscribe and List-Unsubscribe-Post are passed through directly.
 */

import { Resend } from 'resend';
import type { EmailProviderKind } from '@digest/shared';
import { sendBatchWithLimits } from './rate-limit';
import type {
  EmailMessage,
  EmailProvider,
  EmailRecipient,
  ProviderLogger,
  SendResult,
} from './provider';
import { noopLogger } from './provider';
import type { BatchSendOptions } from './rate-limit';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface ResendConfig {
  readonly apiKey?: string;
}

function readResendConfig(): ResendConfig {
  return {
    apiKey: process.env['RESEND_API_KEY'],
  };
}

// ---------------------------------------------------------------------------
// ResendEmailProvider
// ---------------------------------------------------------------------------

export interface ResendEmailProviderOptions extends BatchSendOptions {
  /** Injected logger — defaults to no-op. */
  logger?: ProviderLogger;
  /** Override env-based config (useful in tests). */
  config?: ResendConfig;
}

export class ResendEmailProvider implements EmailProvider {
  readonly kind: EmailProviderKind = 'resend';

  readonly #opts: Required<ResendEmailProviderOptions>;

  constructor(opts: ResendEmailProviderOptions = {}) {
    this.#opts = {
      concurrency: opts.concurrency ?? 5,
      perMinute: opts.perMinute ?? 100,
      maxRetries: opts.maxRetries ?? 3,
      baseDelayMs: opts.baseDelayMs ?? 500,
      maxDelayMs: opts.maxDelayMs ?? 16_000,
      logger: opts.logger ?? noopLogger,
      config: opts.config ?? readResendConfig(),
    };
  }

  async verifyConfig(): Promise<{ ok: boolean; detail?: string }> {
    const cfg = this.#opts.config;
    if (!cfg.apiKey) {
      return { ok: false, detail: 'RESEND_API_KEY is required but not set.' };
    }
    return { ok: true };
  }

  async send(msg: EmailMessage): Promise<SendResult> {
    const client = new Resend(this.#opts.config.apiKey);
    return this.#sendOne(client, msg);
  }

  async sendBatch(msgs: readonly EmailMessage[]): Promise<SendResult[]> {
    const client = new Resend(this.#opts.config.apiKey);
    return sendBatchWithLimits(msgs, (msg) => this.#sendOne(client, msg as EmailMessage), {
      concurrency: this.#opts.concurrency,
      perMinute: this.#opts.perMinute,
      maxRetries: this.#opts.maxRetries,
      baseDelayMs: this.#opts.baseDelayMs,
      maxDelayMs: this.#opts.maxDelayMs,
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  async #sendOne(client: Resend, msg: EmailMessage): Promise<SendResult> {
    const logger = this.#opts.logger;

    logger.info('resend: sending email', { to: msg.to.email, subject: msg.subject });

    const response = await client.emails.send({
      from: formatAddress(msg.from),
      to: msg.to.email,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      // Pass through all headers verbatim — List-Unsubscribe etc.
      headers: msg.headers,
    });

    if (response.error !== null) {
      throw new Error(
        `ResendEmailProvider: send failed — ${response.error.name}: ${response.error.message}`,
      );
    }

    const id = response.data?.id ?? 'unknown';
    logger.info('resend: email queued', { id, to: msg.to.email });

    // Resend enqueues the message; actual delivery is async.
    return { providerMessageId: id, status: 'queued' };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formats a recipient as "Display Name <email>" or just "email". */
function formatAddress(recipient: EmailRecipient): string {
  return recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email;
}
