/**
 * In-process fixed-window rate limiter.
 *
 * WARNING: state lives in a module-scope Map. It does NOT survive a process
 * restart and does NOT span multiple instances. This is intentional for a
 * single self-hosted instance; if the deployment is scaled horizontally,
 * replace this with a shared store (e.g. Redis) so limits are enforced globally.
 *
 * `Date.now()` is the only time source so tests can drive it with fake timers.
 */

interface WindowState {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, WindowState>();

export interface RateLimitResult {
  allowed: boolean;
  /** Milliseconds until the current window expires (only set when blocked). */
  retryAfterMs?: number;
}

/**
 * Fixed-window check for a given IP + action. Returns whether the request is
 * allowed and, when blocked, how long until the window resets.
 */
export function checkRateLimit(
  ip: string,
  action: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  pruneStale(now, windowMs);

  const key = `${action}:${ip}`;
  const entry = buckets.get(key);

  // No entry, or the previous window has fully elapsed → start a fresh window.
  if (!entry || now - entry.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count < limit) {
    buckets.set(key, { count: entry.count + 1, windowStart: entry.windowStart });
    return { allowed: true };
  }

  return { allowed: false, retryAfterMs: entry.windowStart + windowMs - now };
}

/**
 * Opportunistic eviction: drop entries whose window expired well in the past.
 * Runs inline on every check — O(n), but the map stays tiny on a single
 * instance, so this is the simplest correct option (no background timer to
 * leak or guard).
 */
function pruneStale(now: number, windowMs: number): void {
  const staleBefore = now - windowMs * 2;
  for (const [key, entry] of buckets) {
    if (entry.windowStart < staleBefore) buckets.delete(key);
  }
}

/**
 * Best-effort client IP from request headers.
 *
 * Resolution order:
 *   1. `TRUSTED_CLIENT_IP_HEADER` (if set) — the canonical client-IP header of
 *      the fronting CDN / load balancer (e.g. `cf-connecting-ip` behind
 *      Cloudflare, `x-real-ip` behind nginx). Such a header is set and stripped
 *      by the provider, so it is NOT spoofable by the client — prefer it when
 *      deployed behind a cloud LB.
 *   2. `x-forwarded-for` (first value) — only trustworthy behind a reverse proxy
 *      that sets/strips it (the single-instance self-hosted default).
 *   3. `x-real-ip`, then localhost.
 *
 * Set `TRUSTED_CLIENT_IP_HEADER` when fronting the app with a CDN/LB so the rate
 * limiter keys on a non-spoofable IP. (Horizontal scaling additionally needs a
 * shared limiter store — see rate-limit's module note — which is out of scope
 * for the single-instance deployment.)
 */
export function getClientIp(headers: Headers): string {
  const trustedHeader = process.env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  if (trustedHeader) {
    const trusted = headers.get(trustedHeader);
    if (trusted) {
      const first = trusted.split(',')[0]?.trim();
      if (first) return first;
    }
  }

  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip') ?? '127.0.0.1';
}
