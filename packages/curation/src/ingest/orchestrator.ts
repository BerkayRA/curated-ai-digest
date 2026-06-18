import { deduplicateWithinRun, filterAgainstExisting } from './dedup.js';
import { createPrismaRepository } from './repository.js';
import { defaultProviders } from './providers.js';
import { DEFAULT_TOPIC } from './sources.js';
import type {
  IngestResult,
  IngestRepository,
  Logger,
  RawCandidate,
  SourceContext,
  SourceError,
  SourceProvider,
} from './types.js';

// ---------------------------------------------------------------------------
// Ingest orchestrator
// ---------------------------------------------------------------------------

export interface IngestOptions {
  /** Override the repository (useful in tests). */
  repository?: IngestRepository;
  /** Override the logger (useful in tests or workers). */
  logger?: Logger;
  /**
   * Override the set of source providers. Defaults to `defaultProviders()`
   * (rss + exa). Inject fakes in tests or a custom registry in workers.
   */
  providers?: readonly SourceProvider[];
  /**
   * Topic threaded into every provider's SourceContext (tunes Exa queries,
   * etc.). Defaults to {@link DEFAULT_TOPIC}; the worker/caller may override it
   * (and will eventually source it from Settings).
   */
  topic?: string;
}

/** A no-op logger used when no logger is provided. */
const silentLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/**
 * Run a single provider with full isolation: any thrown error is converted to a
 * SourceError keyed by the provider id so it never aborts the whole run.
 */
async function runProvider(
  provider: SourceProvider,
  ctx: SourceContext,
): Promise<{ candidates: readonly RawCandidate[]; errors: readonly SourceError[] }> {
  try {
    const result = await provider.fetch(ctx);
    return { candidates: result.candidates, errors: result.errors };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.error('ingest.provider.failed', { provider: provider.id, message });
    return { candidates: [], errors: [{ source: provider.id, message }] };
  }
}

/**
 * Run the full ingest pipeline:
 * 1. Fetch from every configured provider concurrently (each fully isolated —
 *    a thrown provider becomes a SourceError and never aborts the run).
 * 2. Deduplicate within the run.
 * 3. Filter against candidates already in the DB.
 * 4. Persist new candidates and record an IngestRun.
 *
 * Non-fatal source errors are collected and included in the result; the
 * orchestrator itself only throws if the DB write fails.
 */
export async function runIngest(opts: IngestOptions = {}): Promise<IngestResult> {
  const logger = opts.logger ?? silentLogger;
  const repo = opts.repository ?? createPrismaRepository();
  const providers = opts.providers ?? defaultProviders();
  const topic = opts.topic ?? DEFAULT_TOPIC;

  logger.info('ingest.start', { providers: providers.length, topic });

  // 1. Fetch from all providers concurrently, each isolated.
  const ctx: SourceContext = { topic, logger };
  const settled = await Promise.allSettled(providers.map((p) => runProvider(p, ctx)));

  const allCandidates: RawCandidate[] = [];
  const allErrors: SourceError[] = [];
  const bySource: Record<string, number> = {};

  for (let i = 0; i < settled.length; i++) {
    const provider = providers[i];
    const outcome = settled[i];
    if (!provider || !outcome) continue;

    // runProvider never rejects, but guard the settled shape for safety.
    if (outcome.status === 'fulfilled') {
      allCandidates.push(...outcome.value.candidates);
      allErrors.push(...outcome.value.errors);
      bySource[provider.id] = outcome.value.candidates.length;
    } else {
      const message =
        outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      allErrors.push({ source: provider.id, message });
      bySource[provider.id] = 0;
    }
  }

  logger.info('ingest.fetched', { count: allCandidates.length, bySource });

  // 2. Within-run dedup.
  const deduped = deduplicateWithinRun(allCandidates);

  logger.info('ingest.deduped', { count: deduped.length });

  // 3. Filter against DB.
  const urls = deduped.map((c) => c.canonicalUrl);
  const hashes = deduped.map((c) => c.contentHash);

  const [existingUrls, existingHashes] = await Promise.all([
    repo.findExistingUrls(urls),
    repo.findExistingHashes(hashes),
  ]);

  const newCandidates = filterAgainstExisting(deduped, existingUrls, existingHashes);

  logger.info('ingest.new', { count: newCandidates.length });

  // 4. Persist. The source label records which providers contributed.
  const source = providers.map((p) => p.id).join('+') || 'none';

  const ingestRunId = await repo.persistRun({
    source,
    candidates: newCandidates,
    errors: allErrors,
  });

  logger.info('ingest.done', { ingestRunId, persisted: newCandidates.length });

  return {
    ingestRunId,
    fetched: allCandidates.length,
    deduped: deduped.length,
    persisted: newCandidates.length,
    errors: allErrors,
    bySource,
  };
}
