/**
 * Rate limiting for the public, unauthenticated web archive (+ RSS).
 *
 * The archive pages are ISR-cached (revalidate=300), but a flood of requests for
 * DISTINCT bogus paths (/archive/foo, /archive/bar, …) each miss the cache and
 * hit the DB (topic lookup). A per-IP cap bounds that abuse vector before any DB
 * work happens. Enforced in middleware (a single point covering both archive
 * pages and the rss.xml route handler).
 *
 * Pure + side-effect-free apart from the shared in-process limiter, so it is
 * unit-testable without Next.js (drive Date.now via fake timers like
 * rate-limit.test.ts).
 */

import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

/** Requests allowed per window, per IP, across all /archive paths. */
export const ARCHIVE_RATE_LIMIT = 60;
/** Fixed window length (1 minute) — 60/min ≈ 1 req/s sustained per IP. */
export const ARCHIVE_RATE_WINDOW_MS = 60_000;

/** True for the public archive index, a single issue, or its RSS feed. */
export function isArchivePath(pathname: string): boolean {
  return pathname === '/archive' || pathname.startsWith('/archive/');
}

export interface ArchiveRateLimitBlock {
  /** Seconds until the window resets — for the Retry-After header. */
  readonly retryAfterSec: number;
}

/**
 * Returns a block descriptor when an /archive request from this IP has exceeded
 * the per-IP limit, or null when the request is allowed (or not an archive path).
 */
export function checkArchiveRateLimit(
  pathname: string,
  headers: Headers,
): ArchiveRateLimitBlock | null {
  if (!isArchivePath(pathname)) {
    return null;
  }
  const ip = getClientIp(headers);
  const result = checkRateLimit(ip, 'archive', ARCHIVE_RATE_LIMIT, ARCHIVE_RATE_WINDOW_MS);
  if (result.allowed) {
    return null;
  }
  return {
    retryAfterSec: Math.max(1, Math.ceil((result.retryAfterMs ?? ARCHIVE_RATE_WINDOW_MS) / 1000)),
  };
}
