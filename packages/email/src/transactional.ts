/**
 * Transactional email — single-message sends that are NOT the weekly digest
 * (e.g. the double opt-in confirmation). Renders a minimal branded template and
 * sends one message via the active provider, with no Send record, no tracking
 * hooks, and no batching.
 */

import * as React from 'react';
import { render, toPlainText } from '@react-email/render';
import { ConfirmEmail } from './templates/ConfirmEmail';
import type { ConfirmEmailData, RenderedEmail } from './types';
import type { EmailMessage, EmailProvider, SendResult } from './providers/provider';

/**
 * Render the double opt-in confirmation email to HTML + plain text.
 *
 * Email images are referenced by absolute URL, so `assetBaseUrl` (defaulting to
 * APP_BASE_URL) must be reachable when the recipient opens the message.
 */
export async function renderConfirmEmail(data: ConfirmEmailData): Promise<RenderedEmail> {
  const merged: ConfirmEmailData = {
    ...data,
    assetBaseUrl: data.assetBaseUrl ?? process.env.APP_BASE_URL ?? '',
  };
  const element = React.createElement(ConfirmEmail, merged);
  const html = await render(element);
  const text = toPlainText(html);
  return { html, text };
}

/**
 * Send a single transactional message via the given provider. Verifies provider
 * configuration first (throws with a descriptive message when unavailable), then
 * sends. No retry logic at this layer — callers decide how to surface failure.
 */
export async function sendTransactionalEmail(
  provider: EmailProvider,
  msg: EmailMessage,
): Promise<SendResult> {
  const config = await provider.verifyConfig();
  if (!config.ok) {
    throw new Error(
      `E-posta sağlayıcısı yapılandırılmamış: ${config.detail ?? 'bilinmeyen hata'}`,
    );
  }
  return provider.send(msg);
}
