import { canonicalizeUrl, contentHash, isAllowedScheme } from './canonicalize.js';
import type { RawCandidate, EnrichedCandidate } from './types.js';

// ---------------------------------------------------------------------------
// Deduplication: within-run and against existing DB rows
// ---------------------------------------------------------------------------

/** Enrich a raw candidate with canonical URL and content hash. */
export function enrichCandidate(raw: RawCandidate): EnrichedCandidate {
  const canonical = canonicalizeUrl(raw.sourceUrl);
  return {
    ...raw,
    canonicalUrl: canonical,
    contentHash: contentHash(canonical, raw.title),
  };
}

/**
 * Deduplicate an array of raw candidates within a single run.
 *
 * Strategy (applied in order):
 * 1. Reject candidates whose sourceUrl scheme is not http or https.
 * 2. Enrich each candidate (compute canonicalUrl + contentHash).
 * 3. Keep the first occurrence of each contentHash — later duplicates (same
 *    canonical URL + same title) are dropped.
 * 4. As a secondary guard, also keep only the first occurrence of each
 *    canonicalUrl so two differently-titled articles from the exact same URL
 *    don't both survive.
 *
 * Returns enriched, deduplicated candidates.
 */
export function deduplicateWithinRun(
  raws: readonly RawCandidate[],
): readonly EnrichedCandidate[] {
  const seenHashes = new Set<string>();
  const seenUrls = new Set<string>();
  const result: EnrichedCandidate[] = [];

  for (const raw of raws) {
    // Reject non-http/https URLs (e.g. javascript:, data:, file:)
    if (!isAllowedScheme(raw.sourceUrl)) continue;

    const enriched = enrichCandidate(raw);

    if (seenHashes.has(enriched.contentHash)) continue;
    if (seenUrls.has(enriched.canonicalUrl)) continue;

    seenHashes.add(enriched.contentHash);
    seenUrls.add(enriched.canonicalUrl);
    result.push(enriched);
  }

  return result;
}

/**
 * Filter out candidates already present in the DB.
 *
 * `existingUrls` and `existingHashes` are Sets pre-fetched from the DB by the
 * repository. This function is pure so it's easy to unit-test without a live
 * database.
 */
export function filterAgainstExisting(
  candidates: readonly EnrichedCandidate[],
  existingUrls: ReadonlySet<string>,
  existingHashes: ReadonlySet<string>,
): readonly EnrichedCandidate[] {
  return candidates.filter(
    (c) => !existingUrls.has(c.canonicalUrl) && !existingHashes.has(c.contentHash),
  );
}
