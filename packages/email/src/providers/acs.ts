/**
 * AcsEmailProvider — Azure Communication Services email transport.
 *
 * Authentication modes (auto-selected at runtime):
 *   1. Connection-string auth: set ACS_CONNECTION_STRING.
 *      EmailClient(connectionString) — HMAC-signed requests.
 *   2. Managed-identity / workload-identity auth: set ACS_ENDPOINT.
 *      EmailClient(endpoint, new DefaultAzureCredential()) — token-based.
 *      Works for Managed Identity, Workload Identity, Azure CLI, VS Code, etc.
 *
 * Mode 1 takes precedence when both env vars are present.
 *
 * Required env vars (one pair required):
 *   Mode 1: ACS_CONNECTION_STRING
 *   Mode 2: ACS_ENDPOINT  (+ any DefaultAzureCredential source)
 *
 * Sender address:
 *   ACS_SENDER_ADDRESS — must be a verified domain address in the ACS resource.
 *
 * Rate-limit defaults:
 *   concurrency = 5, perMinute = 30 (conservative; ACS free tier is 100/min,
 *   standard tier is higher — tune via options).
 */

import { EmailClient, KnownEmailSendStatus } from '@azure/communication-email';
import { DefaultAzureCredential } from '@azure/identity';
import type { EmailProviderKind } from '@digest/shared';
import { sendBatchWithLimits } from './rate-limit.js';
import type {
  EmailMessage,
  EmailProvider,
  EmailRecipient,
  ProviderLogger,
  SendResult,
} from './provider.js';
import { noopLogger } from './provider.js';
import type { BatchSendOptions } from './rate-limit.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface AcsConfig {
  readonly connectionString?: string;
  readonly endpoint?: string;
  readonly senderAddress?: string;
}

function readAcsConfig(): AcsConfig {
  return {
    connectionString: process.env['ACS_CONNECTION_STRING'],
    endpoint: process.env['ACS_ENDPOINT'],
    senderAddress: process.env['ACS_SENDER_ADDRESS'],
  };
}

// ---------------------------------------------------------------------------
// AcsEmailProvider
// ---------------------------------------------------------------------------

export interface AcsEmailProviderOptions extends BatchSendOptions {
  /** Injected logger — defaults to no-op. */
  logger?: ProviderLogger;
  /** Override env-based config (useful in tests). */
  config?: AcsConfig;
}

export class AcsEmailProvider implements EmailProvider {
  readonly kind: EmailProviderKind = 'acs_email';

  readonly #opts: Required<AcsEmailProviderOptions>;

  constructor(opts: AcsEmailProviderOptions = {}) {
    this.#opts = {
      concurrency: opts.concurrency ?? 5,
      perMinute: opts.perMinute ?? 30,
      maxRetries: opts.maxRetries ?? 3,
      baseDelayMs: opts.baseDelayMs ?? 500,
      maxDelayMs: opts.maxDelayMs ?? 16_000,
      logger: opts.logger ?? noopLogger,
      config: opts.config ?? readAcsConfig(),
    };
  }

  async verifyConfig(): Promise<{ ok: boolean; detail?: string }> {
    const cfg = this.#opts.config;
    if (!cfg.senderAddress) {
      return { ok: false, detail: 'ACS_SENDER_ADDRESS is required but not set.' };
    }
    if (!cfg.connectionString && !cfg.endpoint) {
      return {
        ok: false,
        detail: 'Either ACS_CONNECTION_STRING or ACS_ENDPOINT must be set.',
      };
    }
    return { ok: true };
  }

  async send(msg: EmailMessage): Promise<SendResult> {
    const client = this.#buildClient();
    return this.#sendOne(client, msg);
  }

  async sendBatch(msgs: readonly EmailMessage[]): Promise<SendResult[]> {
    const client = this.#buildClient();
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

  #buildClient(): EmailClient {
    const cfg = this.#opts.config;
    if (cfg.connectionString) {
      return new EmailClient(cfg.connectionString);
    }
    if (cfg.endpoint) {
      return new EmailClient(cfg.endpoint, new DefaultAzureCredential());
    }
    throw new Error(
      'AcsEmailProvider: cannot build client — neither ACS_CONNECTION_STRING nor ACS_ENDPOINT is set.',
    );
  }

  async #sendOne(client: EmailClient, msg: EmailMessage): Promise<SendResult> {
    const cfg = this.#opts.config;
    const senderAddress = cfg.senderAddress ?? '';

    const acsMessage = {
      senderAddress,
      content: {
        subject: msg.subject,
        html: msg.html,
        plainText: msg.text,
      },
      recipients: {
        to: [buildAddress(msg.to)],
      },
      // Pass through custom headers (List-Unsubscribe, etc.) verbatim.
      headers: msg.headers as Record<string, string> | undefined,
    };

    const logger = this.#opts.logger;
    logger.info('acs: sending email', { to: msg.to.email, subject: msg.subject });

    const poller = await client.beginSend(acsMessage);
    const result = await poller.pollUntilDone();

    if (result.status === KnownEmailSendStatus.Succeeded) {
      logger.info('acs: email sent', { id: result.id, to: msg.to.email });
      return { providerMessageId: result.id, status: 'sent' };
    }

    if (
      result.status === KnownEmailSendStatus.Running ||
      result.status === KnownEmailSendStatus.NotStarted
    ) {
      // Should not reach here after pollUntilDone(), but treat as queued.
      logger.warn('acs: email still in progress after poll', { id: result.id });
      return { providerMessageId: result.id, status: 'queued' };
    }

    // Failed / Cancelled terminal states.
    const detail = result.error?.message ?? result.status;
    throw new Error(`AcsEmailProvider: send failed [${result.id}]: ${detail}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAddress(recipient: EmailRecipient): { address: string; displayName?: string } {
  return recipient.name
    ? { address: recipient.email, displayName: recipient.name }
    : { address: recipient.email };
}
