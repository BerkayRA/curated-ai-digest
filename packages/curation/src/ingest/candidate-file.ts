import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import type { EnrichedCandidate } from './types';

// ---------------------------------------------------------------------------
// Artifact contract for the daily scan candidate pool
// ---------------------------------------------------------------------------

export const CANDIDATES_DIR_DEFAULT = 'data/candidates';
export const LATEST_FILE = 'latest.jsonl';
export const INDEX_FILE = 'index.json';

// ---------------------------------------------------------------------------
// Schema + types
// ---------------------------------------------------------------------------

export const storedCandidateSchema = z.object({
  title: z.string(),
  sourceUrl: z.string(),
  sourceName: z.string(),
  rawExcerpt: z.string().optional(),
  publishedAt: z.string().nullable().optional(),
  canonicalUrl: z.string(),
  contentHash: z.string(),
  firstSeenAt: z.string(),
  ingestRunId: z.string(),
});

export type StoredCandidate = z.infer<typeof storedCandidateSchema>;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Map an EnrichedCandidate + run metadata to a StoredCandidate.
 * publishedAt Date is serialized to ISO string; undefined becomes null.
 * Does not mutate the input.
 */
export function toStored(
  candidate: EnrichedCandidate,
  ingestRunId: string,
  firstSeenAt: Date,
): StoredCandidate {
  const publishedAt =
    candidate.publishedAt instanceof Date ? candidate.publishedAt.toISOString() : null;

  const stored: StoredCandidate = {
    title: candidate.title,
    sourceUrl: candidate.sourceUrl,
    sourceName: candidate.sourceName,
    canonicalUrl: candidate.canonicalUrl,
    contentHash: candidate.contentHash,
    firstSeenAt: firstSeenAt.toISOString(),
    ingestRunId,
    publishedAt,
  };

  if (candidate.rawExcerpt !== undefined) {
    return { ...stored, rawExcerpt: candidate.rawExcerpt };
  }

  return stored;
}

/**
 * Serialize a StoredCandidate to a single-line JSON string (NDJSON format).
 */
export function serializeStored(stored: StoredCandidate): string {
  return JSON.stringify(stored);
}

/**
 * Parse one NDJSON line into a StoredCandidate.
 * Returns undefined when the line is blank, invalid JSON, or fails schema validation.
 */
export function parseStoredLine(line: string): StoredCandidate | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }

  const result = storedCandidateSchema.safeParse(parsed);
  return result.success ? result.data : undefined;
}

/**
 * Read the candidate pool from `<dir>/latest.jsonl`.
 * Tolerates a missing file or directory (returns []).
 * Garbage lines are skipped silently.
 */
export async function readPool(dir: string): Promise<StoredCandidate[]> {
  const filePath = path.join(dir, LATEST_FILE);

  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch {
    return [];
  }

  const results: StoredCandidate[] = [];
  for (const line of content.split('\n')) {
    const item = parseStoredLine(line);
    if (item !== undefined) {
      results.push(item);
    }
  }

  return results;
}

/**
 * Write a file atomically: write to a temp file in the same directory, then
 * rename over the target. rename(2) is atomic on the same filesystem, so a crash
 * mid-write can never leave a truncated/partial destination — which would
 * otherwise read back as an empty pool and wipe the entire dedup history.
 */
async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmpPath, content, 'utf8');
  await fs.rename(tmpPath, filePath);
}

/**
 * Write the candidate pool to `<dir>/latest.jsonl` as NDJSON (atomically).
 * Creates the directory recursively if needed.
 */
export async function writePool(dir: string, items: readonly StoredCandidate[]): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const content = items.map(serializeStored).join('\n') + (items.length > 0 ? '\n' : '');
  await writeFileAtomic(path.join(dir, LATEST_FILE), content);
}

/**
 * Write an index metadata file to `<dir>/index.json`.
 * Pretty-printed for human readability.
 */
export async function writeIndex(
  dir: string,
  meta: Record<string, unknown>,
): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await writeFileAtomic(path.join(dir, INDEX_FILE), JSON.stringify(meta, null, 2));
}
