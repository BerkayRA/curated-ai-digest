/**
 * POST /api/sources/run
 *
 * Trigger an on-demand ingest run — resolves all enabled DB sources, fetches
 * candidates, deduplicates against existing rows, and persists new articles.
 *
 * Returns the IngestResult summary: { fetched, persisted, deduped, errors, bySource }.
 *
 * Synchronous for v1 (waits for the full run before responding). The curation
 * package is dynamically imported so it never enters the edge/client bundle.
 *
 * Auth is enforced by middleware. Same-origin guard applied on this mutation.
 */

import { NextResponse } from 'next/server';
import { ok, err } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/error';
import { assertSameOrigin } from '@/lib/assert-same-origin';
import type { Logger } from '@digest/curation';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Minimal structured logger that writes to process.stdout via console methods. */
const makeLogger = (): Logger => ({
  info: (msg, meta) =>
    void (meta ? process.stdout.write(`[sources/run] INFO  ${msg} ${JSON.stringify(meta)}\n`) : process.stdout.write(`[sources/run] INFO  ${msg}\n`)),
  warn: (msg, meta) =>
    void (meta ? process.stderr.write(`[sources/run] WARN  ${msg} ${JSON.stringify(meta)}\n`) : process.stderr.write(`[sources/run] WARN  ${msg}\n`)),
  error: (msg, meta) =>
    void (meta ? process.stderr.write(`[sources/run] ERROR ${msg} ${JSON.stringify(meta)}\n`) : process.stderr.write(`[sources/run] ERROR ${msg}\n`)),
});

export async function POST(request: Request): Promise<NextResponse> {
  const csrfCheck = assertSameOrigin(request);
  if (csrfCheck !== null) return csrfCheck;

  try {
    const { runIngestFromDb } = await import('@digest/curation');
    const logger = makeLogger();

    const result = await runIngestFromDb({ logger });

    return NextResponse.json(
      ok({
        fetched: result.fetched,
        persisted: result.persisted,
        deduped: result.deduped,
        errors: result.errors,
        bySource: result.bySource,
      }),
    );
  } catch (error) {
    return NextResponse.json(err(getErrorMessage(error)), { status: 500 });
  }
}
