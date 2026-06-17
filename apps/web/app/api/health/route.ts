/**
 * GET /api/health
 * Public health-check endpoint used by the Docker Compose healthcheck.
 * Returns 200 { status: 'ok' } with no authentication required.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ status: 'ok' });
}
