import { toStored, readPool, writePool, writeIndex } from './candidate-file.js';
import type { IngestRepository, PersistRunOpts } from './types.js';

// ---------------------------------------------------------------------------
// File-based implementation of IngestRepository
// ---------------------------------------------------------------------------

export interface FileRepositoryOptions {
  /** Directory where latest.jsonl and index.json are written. */
  readonly dir: string;
  /** Maximum number of candidates to retain in the pool (default: 200). */
  readonly maxItems?: number;
  /**
   * Injectable clock for deterministic tests.
   * Defaults to `new Date()` at call time.
   */
  readonly now?: () => Date;
}

/**
 * Create an IngestRepository that persists candidates to a local NDJSON file
 * instead of a database.
 *
 * - Cross-run dedup is performed by reading the existing pool before each write.
 * - `firstSeenAt` is preserved for URLs already in the pool.
 * - The pool is capped to `maxItems` (newest by publishedAt first).
 */
export function createFileRepository(opts: FileRepositoryOptions): IngestRepository {
  const { dir, maxItems = 200, now = () => new Date() } = opts;

  return {
    // The file pool is topic-unaware: `topicId` is accepted to satisfy the
    // IngestRepository interface but deliberately ignored.
    async findExistingUrls(
      urls: readonly string[],
      _topicId: string,
    ): Promise<Set<string>> {
      if (urls.length === 0) return new Set();
      const pool = await readPool(dir);
      const poolUrls = new Set(pool.map((item) => item.canonicalUrl));
      const result = new Set<string>();
      for (const url of urls) {
        if (poolUrls.has(url)) result.add(url);
      }
      return result;
    },

    async findExistingHashes(
      hashes: readonly string[],
      _topicId: string,
    ): Promise<Set<string>> {
      if (hashes.length === 0) return new Set();
      const pool = await readPool(dir);
      const poolHashes = new Set(pool.map((item) => item.contentHash));
      const result = new Set<string>();
      for (const hash of hashes) {
        if (poolHashes.has(hash)) result.add(hash);
      }
      return result;
    },

    async persistRun(opts: PersistRunOpts): Promise<string> {
      const { source, candidates, errors } = opts;
      const currentNow = now();
      const runId = `file-${currentNow.toISOString()}`;

      // Load existing pool to enable cross-run dedup + firstSeenAt preservation.
      const existing = await readPool(dir);
      const existingByUrl = new Map(existing.map((item) => [item.canonicalUrl, item]));

      // Track how many candidates are genuinely new.
      let added = 0;

      // Merge: keep existing items, add new ones that aren't already in pool.
      const merged = [...existing];

      for (const candidate of candidates) {
        if (existingByUrl.has(candidate.canonicalUrl)) {
          // URL already in pool — skip (preserves firstSeenAt of existing record).
          continue;
        }

        // New candidate: assign firstSeenAt = now.
        const stored = toStored(candidate, runId, currentNow);
        merged.push(stored);
        existingByUrl.set(candidate.canonicalUrl, stored);
        added++;
      }

      // Sort by publishedAt descending; fall back to firstSeenAt descending.
      const sorted = [...merged].sort((a, b) => {
        const aTime = a.publishedAt ?? a.firstSeenAt;
        const bTime = b.publishedAt ?? b.firstSeenAt;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });

      // Cap to maxItems (keep newest).
      const capped = sorted.slice(0, maxItems);

      await writePool(dir, capped);

      await writeIndex(dir, {
        lastRunId: runId,
        generatedAt: currentNow.toISOString(),
        source,
        errorsCount: errors.length,
        poolSize: capped.length,
        added,
      });

      return runId;
    },
  };
}
