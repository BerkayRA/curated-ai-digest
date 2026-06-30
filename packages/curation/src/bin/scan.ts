#!/usr/bin/env node
/**
 * scan.ts — CLI entrypoint for the daily deterministic scan.
 *
 * Reads configuration from environment variables:
 *   CANDIDATES_DIR   — output directory. When unset, defaults to
 *                      data/candidates/<topicSlug> (resolved against INIT_CWD —
 *                      the dir `pnpm` was invoked from). An explicit
 *                      CANDIDATES_DIR is honored as-is (used by the GitHub Action).
 *   SCAN_TOPIC       — topic string passed to providers (default: DEFAULT_TOPIC)
 *   SCAN_TOPIC_SLUG  — topic slug used to namespace the default dir
 *                      (default: DEFAULT_TOPIC_SLUG = 'enterprise-ai')
 *   SCAN_MAX_ITEMS   — pool size cap (default: 200)
 *
 * Logs progress to STDERR; prints the IngestResult as JSON to STDOUT on success.
 * Exit code 0 on partial success (some errors OK); exit 1 only when all sources
 * failed (result.fetched === 0) or runScan throws.
 */

import * as path from 'node:path';
import { runScan, DEFAULT_TOPIC_SLUG } from '../scan/run-scan';
import { DEFAULT_TOPIC } from '../ingest/sources';
import type { Logger } from '../ingest/types';

// ---------------------------------------------------------------------------
// Console-based logger: logs to STDERR so STDOUT stays clean for JSON output.
// ---------------------------------------------------------------------------

const logger: Logger = {
  info: (msg, meta) =>
    process.stderr.write(
      `[scan:info] ${msg}${meta !== undefined ? ' ' + JSON.stringify(meta) : ''}\n`,
    ),
  warn: (msg, meta) =>
    process.stderr.write(
      `[scan:warn] ${msg}${meta !== undefined ? ' ' + JSON.stringify(meta) : ''}\n`,
    ),
  error: (msg, meta) =>
    process.stderr.write(
      `[scan:error] ${msg}${meta !== undefined ? ' ' + JSON.stringify(meta) : ''}\n`,
    ),
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Resolve the output dir against the directory pnpm was invoked from
  // (INIT_CWD), not the script's cwd: when run via `pnpm --filter @digest/curation
  // scan`, cwd is the package dir, but INIT_CWD is the repo root where `pnpm scan`
  // was launched — which is where the daily Action commits `data/candidates/` from.
  const baseDir = process.env['INIT_CWD'] ?? process.cwd();
  const topicSlug = process.env['SCAN_TOPIC_SLUG'] ?? DEFAULT_TOPIC_SLUG;
  const rawDir = process.env['CANDIDATES_DIR'];
  // Explicit CANDIDATES_DIR wins as-is (the GitHub Action sets it). Otherwise
  // namespace the pool by topic slug so multiple topics never share a pool.
  const dir = path.resolve(baseDir, rawDir ?? path.join('data', 'candidates', topicSlug));
  const topic = process.env['SCAN_TOPIC'] ?? DEFAULT_TOPIC;
  const rawMax = process.env['SCAN_MAX_ITEMS'];
  const maxItems = rawMax !== undefined ? parseInt(rawMax, 10) : 200;

  // Guard a non-numeric SCAN_MAX_ITEMS: NaN flows into Array.slice(0, NaN) === []
  // and would silently wipe the entire pool. Fail loudly instead.
  if (!Number.isFinite(maxItems) || maxItems < 1) {
    logger.error('scan.invalid-max-items', { rawMax });
    process.exit(1);
  }

  logger.info('scan.start', { dir, topic, topicSlug, maxItems });

  const result = await runScan({ dir, topic, topicSlug, maxItems, logger });

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');

  if (result.fetched === 0) {
    logger.error('scan.all-sources-failed', { errors: result.errors });
    process.exit(1);
  }

  logger.info('scan.done', {
    fetched: result.fetched,
    persisted: result.persisted,
    errors: result.errors.length,
  });
}

main().catch((err: unknown) => {
  process.stderr.write(
    `[scan:error] Unhandled error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
