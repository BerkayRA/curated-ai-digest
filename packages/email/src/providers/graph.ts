/**
 * GraphEmailProvider — Microsoft Graph API email transport.
 *
 * Authentication:
 *   Client-credentials flow via @azure/identity ClientSecretCredential.
 *   The TokenCredentialAuthenticationProvider bridges it to the Graph client.
 *
 *   Required env vars:
 *     GRAPH_TENANT_ID      — Azure AD tenant (directory) ID
 *     GRAPH_CLIENT_ID      — App registration client ID
 *     GRAPH_CLIENT_SECRET  — App registration client secret
 *     GRAPH_SENDER_ID      — UPN or object ID of the shared mailbox / licensed user
 *                            used as the sender (must have Mail.Send app permission).
 *
 * Throttle / reputation caveat:
 *   IMPORTANT: Graph API sendMail is subject to Exchange Online throttling.
 *   - Microsoft imposes a per-application rate limit of ~10,000 messages/24h
 *     under normal circumstances, but burst limits can be as low as 4 req/s
 *     per tenant (documented at aka.ms/graphthrottling).
 *   - Sending bulk newsletters from a regular O365 mailbox via Graph risks
 *     outbound spam classification, resulting in delayed or silently dropped
 *     messages and, in severe cases, tenant-level sending blocks.
 *   - For reliable bulk delivery, prefer ACS or Resend. Use this provider
 *     only for low-volume transactional sends or when ACS/Resend cannot be
 *     provisioned.
 *   - perMinute default: 30 (conservative to stay well inside the 4 req/s
 *     burst limit for typical tenant configurations).
 *
 * Custom headers (List-Unsubscribe):
 *   Graph's sendMail API does NOT natively support injecting arbitrary SMTP
 *   headers such as List-Unsubscribe. The message.headers field is therefore
 *   silently discarded by the Graph API. To work around this limitation, place
 *   unsubscribe instructions in the email body (HTML footer) instead.
 *   If header injection is critical, use the ACS or Resend provider.
 */

import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';
import { ClientSecretCredential } from '@azure/identity';
import type { EmailProviderKind } from '@mega-bulten/shared';
import { sendBatchWithLimits } from './rate-limit.js';
import type {
  EmailMessage,
  EmailProvider,
  ProviderLogger,
  SendResult,
} from './provider.js';
import { noopLogger } from './provider.js';
import type { BatchSendOptions } from './rate-limit.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface GraphConfig {
  readonly tenantId?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly senderId?: string;
}

function readGraphConfig(): GraphConfig {
  return {
    tenantId: process.env['GRAPH_TENANT_ID'],
    clientId: process.env['GRAPH_CLIENT_ID'],
    clientSecret: process.env['GRAPH_CLIENT_SECRET'],
    senderId: process.env['GRAPH_SENDER_ID'],
  };
}

// ---------------------------------------------------------------------------
// GraphEmailProvider
// ---------------------------------------------------------------------------

export interface GraphEmailProviderOptions extends BatchSendOptions {
  /** Injected logger — defaults to no-op. */
  logger?: ProviderLogger;
  /** Override env-based config (useful in tests). */
  config?: GraphConfig;
}

export class GraphEmailProvider implements EmailProvider {
  readonly kind: EmailProviderKind = 'microsoft_graph';

  readonly #opts: Required<GraphEmailProviderOptions>;

  constructor(opts: GraphEmailProviderOptions = {}) {
    this.#opts = {
      concurrency: opts.concurrency ?? 3,
      perMinute: opts.perMinute ?? 30,
      maxRetries: opts.maxRetries ?? 3,
      baseDelayMs: opts.baseDelayMs ?? 500,
      maxDelayMs: opts.maxDelayMs ?? 16_000,
      logger: opts.logger ?? noopLogger,
      config: opts.config ?? readGraphConfig(),
    };
  }

  async verifyConfig(): Promise<{ ok: boolean; detail?: string }> {
    const cfg = this.#opts.config;
    const missing: string[] = [];
    if (!cfg.tenantId) missing.push('GRAPH_TENANT_ID');
    if (!cfg.clientId) missing.push('GRAPH_CLIENT_ID');
    if (!cfg.clientSecret) missing.push('GRAPH_CLIENT_SECRET');
    if (!cfg.senderId) missing.push('GRAPH_SENDER_ID');
    if (missing.length > 0) {
      return {
        ok: false,
        detail: `Missing required env vars: ${missing.join(', ')}`,
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

  #buildClient(): Client {
    const cfg = this.#opts.config;
    const credential = new ClientSecretCredential(
      cfg.tenantId ?? '',
      cfg.clientId ?? '',
      cfg.clientSecret ?? '',
    );
    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ['https://graph.microsoft.com/.default'],
    });
    return Client.initWithMiddleware({ authProvider });
  }

  async #sendOne(client: Client, msg: EmailMessage): Promise<SendResult> {
    const cfg = this.#opts.config;
    const senderId = cfg.senderId ?? '';
    const logger = this.#opts.logger;

    // Build the Graph mailMessage payload.
    // Note: Graph sendMail does not support injecting arbitrary SMTP headers
    // such as List-Unsubscribe — see module-level caveat above.
    const mailPayload = {
      message: {
        subject: msg.subject,
        body: {
          contentType: 'HTML',
          content: msg.html,
        },
        toRecipients: [
          {
            emailAddress: {
              address: msg.to.email,
              name: msg.to.name,
            },
          },
        ],
        from: {
          emailAddress: {
            address: msg.from.email,
            name: msg.from.name,
          },
        },
      },
      saveToSentItems: false,
    };

    logger.info('graph: sending email', { to: msg.to.email, subject: msg.subject });

    // POST /users/{id}/sendMail — returns 202 Accepted (no body).
    await client.api(`/users/${senderId}/sendMail`).post(mailPayload);

    // Graph sendMail returns no message id; generate a correlation id from
    // the sender, recipient and timestamp to aid log tracing.
    const syntheticId = `graph:${senderId}:${msg.to.email}:${Date.now()}`;
    logger.info('graph: email accepted', { syntheticId, to: msg.to.email });

    // Graph accepted the message via 202; delivery is queued by Exchange.
    return { providerMessageId: syntheticId, status: 'queued' };
  }
}
