/**
 * Shared, privacy-preserving request metadata for engagement tracking endpoints.
 *
 * Never logs or stores raw IPs or emails:
 *  - the client IP is reduced to a salted, daily-rotating HMAC-SHA256 hash
 *  - the user-agent is coarsely classified, never persisted verbatim
 */

import { createHmac } from 'node:crypto';

export type UaClass = 'mobile' | 'desktop' | 'bot' | 'unknown';

/** Default salt base used when TRACK_SALT_BASE is unset (dev/test only). */
const DEFAULT_SALT_BASE = 'dev-salt';

/** Reads the first-hop client IP from `x-forwarded-for`, or '' if absent. */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (!forwarded) {
    return '';
  }
  return forwarded.split(',')[0]?.trim() ?? '';
}

/** Current UTC date as `YYYY-MM-DD`, used to rotate the IP-hash salt daily. */
function utcDateStamp(now: Date): string {
  return now.toISOString().split('T')[0] ?? '';
}

/**
 * HMAC-SHA256 of the raw IP with a daily-rotating salt. Returns '' for an empty
 * IP so callers can dedup on a stable (empty) hash without leaking anything.
 */
export function hashIp(ip: string, now: Date = new Date()): string {
  if (ip === '') {
    return '';
  }
  const saltBase = process.env['TRACK_SALT_BASE'] ?? DEFAULT_SALT_BASE;
  const key = `${saltBase}${utcDateStamp(now)}`;
  return createHmac('sha256', key).update(ip).digest('hex');
}

/** Coarsely classifies a user-agent string into a bucket; missing → 'unknown'. */
export function classifyUa(userAgent: string | null): UaClass {
  if (!userAgent) {
    return 'unknown';
  }
  const ua = userAgent.toLowerCase();
  if (/bot|crawler|spider/.test(ua)) {
    return 'bot';
  }
  if (/mobi|android|iphone/.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

export interface TrackMeta {
  readonly ipHash: string;
  readonly uaClass: UaClass;
}

/** Derives the (ipHash, uaClass) pair for a tracking request. */
export function deriveTrackMeta(headers: Headers, now: Date = new Date()): TrackMeta {
  const ipHash = hashIp(getClientIp(headers), now);
  const uaClass = classifyUa(headers.get('user-agent'));
  return { ipHash, uaClass };
}
