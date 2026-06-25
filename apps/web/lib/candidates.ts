import path from 'node:path';
import { prisma } from '@digest/db';
import type { CandidateView } from '@digest/curation';

/**
 * Load the recently-scanned candidate pool as a normalized `CandidateView[]`,
 * for the LLM-free curation paths (manual picker + heuristic auto-curate).
 *
 * Primary source is the `CandidateArticle` DB table (status = candidate). When
 * the DB pool is empty (e.g. a fresh install before the worker has imported),
 * it falls back to the committed file pool — the most recently stored scan
 * artifact (`data/candidates/latest.jsonl`). `readPool` tolerates a missing
 * file, so the fallback degrades gracefully to an empty pool.
 *
 * Node-runtime only: it touches Prisma and the filesystem.
 */
export interface RecentCandidates {
  readonly candidates: CandidateView[];
  /** ISO time of the freshest candidate in the pool, or null when empty. */
  readonly scannedAt: string | null;
  readonly source: 'db' | 'file' | 'empty';
}

function candidatesDir(): string {
  // Web app cwd is apps/web; the committed pool lives at the repo root.
  return process.env.CANDIDATES_DIR ?? path.resolve(process.cwd(), '..', '..', 'data', 'candidates');
}

function latestIso(dates: ReadonlyArray<Date | null | undefined>): string | null {
  let max = 0;
  for (const d of dates) {
    if (d && d.getTime() > max) max = d.getTime();
  }
  return max > 0 ? new Date(max).toISOString() : null;
}

export async function loadRecentCandidates(topicId?: string): Promise<RecentCandidates> {
  // --- Primary: DB candidate pool -----------------------------------------
  // Scope to the active topic when provided; a missing topicId keeps the
  // previous topic-agnostic behavior.
  const rows = await prisma.candidateArticle.findMany({
    where: { status: 'candidate', ...(topicId ? { topicId } : {}) },
    orderBy: [{ publishedAt: 'desc' }, { fetchedAt: 'desc' }],
    select: {
      id: true,
      title: true,
      sourceUrl: true,
      sourceName: true,
      rawExcerpt: true,
      publishedAt: true,
      fetchedAt: true,
    },
  });

  if (rows.length > 0) {
    const candidates: CandidateView[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      sourceUrl: r.sourceUrl,
      sourceName: r.sourceName,
      rawExcerpt: r.rawExcerpt,
      publishedAt: r.publishedAt,
      fetchedAt: r.fetchedAt,
    }));
    return {
      candidates,
      scannedAt: latestIso(rows.map((r) => r.fetchedAt)),
      source: 'db',
    };
  }

  // --- Fallback: committed file pool (most recently stored scan) -----------
  // TODO (Phase 1b): the committed file pool is global (single newsletter
  // artifact) and not yet keyed by topic. When the pool moves to per-topic
  // subdirs, scope `candidatesDir()` by topicId here.
  const { readPool } = await import('@digest/curation');
  const stored = await readPool(candidatesDir());
  if (stored.length === 0) {
    return { candidates: [], scannedAt: null, source: 'empty' };
  }

  const candidates: CandidateView[] = stored.map((s) => ({
    title: s.title,
    sourceUrl: s.sourceUrl,
    sourceName: s.sourceName,
    rawExcerpt: s.rawExcerpt ?? null,
    publishedAt: s.publishedAt ? new Date(s.publishedAt) : null,
    fetchedAt: s.firstSeenAt ? new Date(s.firstSeenAt) : null,
  }));

  return {
    candidates,
    scannedAt: latestIso(candidates.map((c) => c.fetchedAt)),
    source: 'file',
  };
}
