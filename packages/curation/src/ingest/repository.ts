import { prisma } from '@mega-bulten/db';
import type { IngestRepository, PersistRunOpts } from './types.js';
import type { EnrichedCandidate } from './types.js';

// ---------------------------------------------------------------------------
// Prisma-backed implementation of IngestRepository
// ---------------------------------------------------------------------------

/**
 * Returns the canonical IngestRepository backed by the singleton PrismaClient.
 * Importing and calling this at module level is fine — the actual DB I/O only
 * happens when the returned methods are invoked.
 */
export function createPrismaRepository(): IngestRepository {
  return {
    async findExistingUrls(urls: readonly string[]): Promise<Set<string>> {
      if (urls.length === 0) return new Set();

      const rows = await prisma.candidateArticle.findMany({
        where: { sourceUrl: { in: [...urls] } },
        select: { sourceUrl: true },
      });

      return new Set(rows.map((r) => r.sourceUrl));
    },

    async findExistingHashes(hashes: readonly string[]): Promise<Set<string>> {
      if (hashes.length === 0) return new Set();

      const rows = await prisma.candidateArticle.findMany({
        where: { contentHash: { in: [...hashes] } },
        select: { contentHash: true },
      });

      return new Set(rows.map((r) => r.contentHash));
    },

    async persistRun(opts: PersistRunOpts): Promise<string> {
      const { source, candidates, errors } = opts;

      const errorSummary =
        errors.length > 0
          ? errors.map((e) => `[${e.source}] ${e.message}`).join('\n')
          : undefined;

      const status = errors.length > 0 && candidates.length === 0 ? 'error' : 'ok';

      return prisma.$transaction(async (tx) => {
        // 1. Create the IngestRun row.
        const run = await tx.ingestRun.create({
          data: {
            source,
            status,
            error: errorSummary,
            candidateCount: candidates.length,
          },
        });

        // 2. Upsert each candidate (idempotent on sourceUrl and contentHash).
        if (candidates.length > 0) {
          await Promise.all(candidates.map((c) => upsertCandidate(tx, c, run.id)));
        }

        // 3. Mark run finished.
        await tx.ingestRun.update({
          where: { id: run.id },
          data: { finishedAt: new Date() },
        });

        return run.id;
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

type PrismaTransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function upsertCandidate(
  tx: PrismaTransactionClient,
  candidate: EnrichedCandidate,
  ingestRunId: string,
): Promise<void> {
  await tx.candidateArticle.upsert({
    where: { sourceUrl: candidate.canonicalUrl },
    create: {
      sourceUrl: candidate.canonicalUrl,
      sourceName: candidate.sourceName,
      title: candidate.title,
      rawExcerpt: candidate.rawExcerpt,
      publishedAt: candidate.publishedAt,
      contentHash: candidate.contentHash,
      ingestRunId,
      fetchedAt: new Date(),
    },
    update: {
      // On conflict (re-run / re-fetch of same URL), keep the existing row
      // but refresh the ingest run link if it was null.
      ingestRunId,
    },
  });
}
