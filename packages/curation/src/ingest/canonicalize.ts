import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// URL canonicalization + content hashing for deduplication
// ---------------------------------------------------------------------------

/** Query-string parameters that carry no canonical meaning. */
const NOISE_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'fbclid',
  'gclid',
  'gad_source',
  'mc_cid',
  'mc_eid',
  'ref',
  'source',
  '_ga',
  '_gl',
  'sid',
  'ck_subscriber_id',
]);

/** Protocols permitted for candidate source URLs. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Returns a canonical form of the given URL:
 * - Lowercases scheme and host.
 * - Removes tracking query parameters.
 * - Removes the fragment (#…).
 * - Strips a trailing slash from the pathname (except bare root "/").
 * - Keeps remaining query params sorted for stability.
 *
 * If the input is not a valid URL the original string is returned unchanged so
 * callers never have to handle a thrown exception from this utility.
 */
export function canonicalizeUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }

  // Remove fragment and noise params.
  parsed.hash = '';
  for (const key of [...parsed.searchParams.keys()]) {
    if (NOISE_PARAMS.has(key)) {
      parsed.searchParams.delete(key);
    }
  }

  // Sort remaining params for stable output.
  parsed.searchParams.sort();

  // Strip trailing slash from pathname (keep bare root).
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  // toString() already lowercases scheme + host per the WHATWG URL spec.
  return parsed.toString();
}

/**
 * Returns true when the given raw URL has an allowed protocol (http or https).
 * URLs that fail to parse are rejected.
 */
export function isAllowedScheme(raw: string): boolean {
  try {
    const { protocol } = new URL(raw);
    return ALLOWED_PROTOCOLS.has(protocol);
  } catch {
    return false;
  }
}

/**
 * Returns a stable, hex-encoded SHA-256 digest computed over the canonical URL
 * and a normalized version of the title (lowercased, whitespace-collapsed).
 *
 * Two articles are considered duplicates if and only if they share the same
 * contentHash — i.e. same canonical URL AND same normalized title.
 */
export function contentHash(canonicalUrl: string, title: string): string {
  const normalizedTitle = title.trim().toLowerCase().replace(/\s+/g, ' ');
  const input = `${canonicalUrl}\x00${normalizedTitle}`;
  return createHash('sha256').update(input, 'utf8').digest('hex');
}
