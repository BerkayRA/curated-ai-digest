import { runIngest } from '../ingest/orchestrator.js';
import { createFileRepository } from '../ingest/file-repository.js';
import { rssProvider } from '../ingest/rss-source.js';
import { radarProvider } from '../ingest/radar-source.js';
import { DEFAULT_TOPIC } from '../ingest/sources.js';
import type { IngestResult, SourceProvider, Logger } from '../ingest/types.js';

// ---------------------------------------------------------------------------
// Scan runner — keyless, no DB, writes to local NDJSON pool
// ---------------------------------------------------------------------------

export interface RunScanOptions {
  /** Directory where the candidate pool artifact is written. */
  readonly dir: string;
  /**
   * Source providers to use. Defaults to [rssProvider, radarProvider].
   * Inject fakes in tests.
   */
  readonly providers?: readonly SourceProvider[];
  /** Topic threaded into SourceContext for every provider. */
  readonly topic?: string;
  /** Maximum candidates to retain in the pool. Defaults to 200. */
  readonly maxItems?: number;
  /** Logger; defaults to a silent no-op. */
  readonly logger?: Logger;
}

const DEFAULT_SCAN_PROVIDERS: readonly SourceProvider[] = [rssProvider, radarProvider];

/**
 * Run a single deterministic scan:
 * 1. Fetch from providers (RSS + Radar by default — no LLM, no API keys).
 * 2. Dedup within the run and against the existing pool file.
 * 3. Write the merged, capped pool back to `<dir>/latest.jsonl` + `index.json`.
 *
 * Returns the IngestResult from the underlying orchestrator.
 * Does NOT touch Postgres / @prisma/client.
 */
export async function runScan(opts: RunScanOptions): Promise<IngestResult> {
  const { dir, topic, maxItems, logger } = opts;
  const providers = opts.providers ?? DEFAULT_SCAN_PROVIDERS;

  const repository = createFileRepository({ dir, maxItems, now: () => new Date() });

  return runIngest({ repository, providers, topic: topic ?? DEFAULT_TOPIC, logger });
}
