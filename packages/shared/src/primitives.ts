import { z } from 'zod';

// ---------------------------------------------------------------------------
// Reusable primitive schemas shared across DTOs.
// ---------------------------------------------------------------------------

/** RFC 5321-compliant e-mail address (lowercased after parse). */
export const emailSchema = z
  .string()
  .trim()
  // RFC 5321 caps an address at 320 chars; bound it so untrusted public input
  // (the self-serve signup endpoint) can't push oversized payloads to the DB.
  .max(320, 'E-mail address is too long')
  .email('Invalid e-mail address')
  .transform((v) => v.toLowerCase());
export type Email = z.infer<typeof emailSchema>;

/** ISO week string — e.g. "2026-W24". */
export const isoWeekSchema = z
  .string()
  .regex(/^\d{4}-W\d{2}$/, 'isoWeek must match YYYY-Wnn (e.g. 2026-W24)');
export type IsoWeek = z.infer<typeof isoWeekSchema>;

/** True when `value` parses as a URL whose protocol is one of `protocols`. */
function hasProtocol(value: string, protocols: readonly string[]): boolean {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/**
 * Scheme guards for URLs rendered into HTML. Zod's `.url()` alone accepts
 * `javascript:`, `data:`, `ftp:`, etc. (it just calls `new URL()`), so any value
 * placed in an `href`/`src` must additionally enforce a safe scheme. Exposed as
 * predicates so callers can compose them with `.max()`/`.nullable()` via
 * `z.string().url().max(n).refine(isHttpsUrl, …)`.
 */
export const isHttpUrl = (u: string): boolean => hasProtocol(u, ['http:', 'https:']);
export const isHttpsUrl = (u: string): boolean => hasProtocol(u, ['https:']);

/** Message used when a URL fails the http(s) scheme guard. */
export const HTTP_URL_MESSAGE = 'URL must use the http or https scheme';
/** Message used when a URL fails the https-only scheme guard. */
export const HTTPS_URL_MESSAGE = 'URL must use the https scheme';

/**
 * A URL restricted to http(s) — for links we render in HTML (e.g. article
 * source URLs shown in the public archive).
 */
export const httpUrlSchema = z.string().url().refine(isHttpUrl, { message: HTTP_URL_MESSAGE });

/** "HH:mm" 24-hour time string. */
export const timeHHmmSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'sendTime must be HH:mm (24 h)');
export type TimeHHmm = z.infer<typeof timeHHmmSchema>;
