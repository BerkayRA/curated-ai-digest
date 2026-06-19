import type { IngestResult, Logger } from './types.js';

// ---------------------------------------------------------------------------
// Record per-source health after an ingest run
// ---------------------------------------------------------------------------

/** Minimal logger used when none is provided. */
const silentLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export interface RecordSourceHealthOptions {
  /** Injected SourceRepository — when provided, @digest/db is NOT imported. */
  repository?: import('@digest/db').SourceRepository;
  logger?: Logger;
  /** Override the timestamp recorded as lastRunAt (defaults to `new Date()`). */
  now?: () => Date;
}

/**
 * Persist health statistics for each DB-backed provider from an ingest run.
 *
 * Provider ids that contain a colon (`<type>:<sourceId>`) are DB-backed; the
 * part after the FIRST colon is the `sourceId` used to call `recordHealth`.
 * Provider ids without a colon are static fallback providers and are skipped.
 */
export async function recordSourceHealth(
  result: IngestResult,
  opts: RecordSourceHealthOptions = {},
): Promise<void> {
  const logger = opts.logger ?? silentLogger;
  const now = opts.now ?? (() => new Date());

  // Obtain repository — lazy-import only when not injected.
  let repo: import('@digest/db').SourceRepository;
  if (opts.repository) {
    repo = opts.repository;
  } else {
    const db = await import('@digest/db');
    repo = db.createSourceRepository(db.prisma);
  }

  const bySource = result.bySource ?? {};

  await Promise.all(
    Object.entries(bySource).map(async ([providerId, count]) => {
      const colonIndex = providerId.indexOf(':');
      if (colonIndex === -1) {
        // Static fallback provider — no DB record to update.
        return;
      }

      const sourceId = providerId.slice(colonIndex + 1);
      const matchingError = result.errors.find((e) => e.source === providerId);
      const lastStatus: 'ok' | 'error' = matchingError ? 'error' : 'ok';
      const lastError: string | null = matchingError?.message ?? null;

      logger.info('record-health.write', { providerId, sourceId, lastStatus });

      await repo.recordHealth(sourceId, {
        lastRunAt: now(),
        lastStatus,
        lastCount: count,
        lastError,
      });
    }),
  );
}
