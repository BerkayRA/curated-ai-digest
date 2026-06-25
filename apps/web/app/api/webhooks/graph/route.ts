/**
 * POST /api/webhooks/graph — placeholder.
 *
 * Microsoft Graph does not emit delivery/engagement webhooks for sent mail,
 * so there is nothing to process. The endpoint exists only so a provider
 * configured for Graph has a stable, documented no-op target.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function POST(): NextResponse {
  return NextResponse.json({
    message: 'Microsoft Graph does not provide delivery webhooks; no events processed.',
  });
}
