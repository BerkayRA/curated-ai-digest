/**
 * renderDigestEmail — renders the branded DigestEmail template to HTML + plain text.
 *
 * Uses @react-email/render (node entry) which wraps react-dom/server.
 *
 * List-Unsubscribe header note:
 *   This function returns the rendered body only. The caller (worker/provider) MUST
 *   add the following headers on the outbound message before sending:
 *
 *     List-Unsubscribe: <{data.unsubscribeUrl}>
 *     List-Unsubscribe-Post: List-Unsubscribe=One-Click
 *
 *   The unsubscribeUrl in DigestEmailData should already be the per-subscriber
 *   token URL at render time; the {{unsubscribeUrl}} placeholder is only for fixtures.
 */

import * as React from 'react';
import { render, toPlainText } from '@react-email/render';
import { DigestEmail } from './templates/DigestEmail.js';
import type { DigestEmailData, RenderedEmail } from './types.js';

/**
 * Renders the digest email to both HTML and plain-text parts.
 *
 * @param data - The issue data including subject, items, and unsubscribe URL.
 * @returns Promise resolving to { html, text } — both parts required by most providers.
 */
export async function renderDigestEmail(data: DigestEmailData): Promise<RenderedEmail> {
  const element = React.createElement(DigestEmail, data);
  const html = await render(element);
  const text = toPlainText(html);

  return { html, text };
}
