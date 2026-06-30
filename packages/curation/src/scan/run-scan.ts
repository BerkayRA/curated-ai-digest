import { runIngest } from '../ingest/orchestrator';
import { createFileRepository } from '../ingest/file-repository';
import { rssProvider } from '../ingest/rss-source';
import { radarProvider } from '../ingest/radar-source';
import { DEFAULT_TOPIC } from '../ingest/sources';
import type { IngestResult, SourceProvider, Logger } from '../ingest/types';

// ---------------------------------------------------------------------------
// Scan runner — keyless, no DB, writes to local NDJSON pool
// ---------------------------------------------------------------------------

/** Default topic slug used to namespace the scan's candidate-pool directory. */
export const DEFAULT_TOPIC_SLUG = 'enterprise-ai';

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
  /**
   * Topic slug for this scan. Defaults to {@link DEFAULT_TOPIC_SLUG}. Used by
   * the CLI to namespace the pool directory; the scan itself is topic-unaware
   * (the file pool is keyless), so this is informational here.
   */
  readonly topicSlug?: string;
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
