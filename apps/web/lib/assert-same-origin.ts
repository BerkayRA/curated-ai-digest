/**
 * CSRF origin check for state-changing API handlers.
 *
 * Rejects requests whose `Origin` header is present and does NOT match
 * APP_BASE_URL. Requests without an `Origin` header (e.g. same-origin server
 * navigations, curl) are allowed through — this mirrors the standard
 * same-origin CSRF mitigation pattern.
 *
 * Returns a 403 NextResponse on mismatch, or `null` when the request passes.
 */

import { NextResponse } from 'next/server';

const APP_BASE_URL = (process.env['APP_BASE_URL'] ?? 'http://localhost:3100').replace(/\/$/, '');

/**
 * Checks whether the request's `Origin` header is acceptable.
 * - No `Origin` header → allowed (same-origin form submissions, server-to-server).
 * - `Origin` matches APP_BASE_URL → allowed.
 * - `Origin` present but mismatched → returns a 403 response.
 *
 * @returns `null` when the request passes, or a 403 `NextResponse` on mismatch.
 */
export function assertSameOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get('origin');

  if (origin === null) {
    // No Origin header — allow (same-origin navigations, curl, server-to-server).
    return null;
  }

  const normalizedOrigin = origin.replace(/\/$/, '');

  if (normalizedOrigin === APP_BASE_URL) {
    return null;
  }

  return NextResponse.json(
    { success: false, error: 'Forbidden: cross-origin request rejected' },
    { status: 403 },
  );
}
