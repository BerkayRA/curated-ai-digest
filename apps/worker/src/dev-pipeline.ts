// ---------------------------------------------------------------------------
// dev-pipeline.ts — run the FULL curation pipeline with NO API credits.
//
// Routes every LLM stage (rank → curate → copywrite → editor QA) through the
// local Claude Code CLI via the dev client, instead of the metered Anthropic
// API. Uses the operator's Claude Code subscription — no ANTHROPIC_API_KEY, no
// per-token billing.
//
// This is a MANUAL dev/test entry point only. It is deliberately NOT wired into
// the scheduler (apps/worker/src/scheduler.ts) — the cron/send path always uses
// the real API client. The dev client is hard-blocked when NODE_ENV=production.
//
// Prereqs:
//   - Claude Code CLI installed on PATH (`claude --version`).
//   - A reachable DATABASE_URL (the dev DB on localhost:5433 by default).
//   - Optionally EXA_API_KEY for neural search; without it, ingest runs on RSS.
//
// Run:
//   pnpm --filter @digest/worker pipeline:dev [--iso-week 2026-W29] [--no-ingest]
//
// Optional env:
//   CLAUDE_CODE_MODEL=claude-opus-4-8   → force a specific CLI model
// ---------------------------------------------------------------------------

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Load apps/worker/.env.local (gitignored) if present. Inline env still wins. */
function loadEnvLocal(): void {
  const envPath = fileURLToPath(new URL('../.env.local', import.meta.url));
  if (existsSync(envPath) && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath);
  }
}

interface CliArgs {
  isoWeek?: string;
  runIngestFirst: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = { runIngestFirst: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--iso-week') {
      args.isoWeek = argv[++i];
    } else if (arg === '--no-ingest') {
      args.runIngestFirst = false;
    }
  }
  return args;
}

async function main(): Promise<void> {
  loadEnvLocal();

  // This script IS the explicit dev entry point, so opt the dev client in
  // automatically. assertDevOnly still hard-blocks it under NODE_ENV=production.
  process.env['CLAUDE_CODE_DEV_CLIENT'] ??= '1';

  const args = parseArgs(process.argv.slice(2));

  const { runWeeklyPipeline, createClaudeCodeClient } = await import('@digest/curation');
  const { renderDigestEmail } = await import('@digest/email');

  const anthropicClient = createClaudeCodeClient();

  console.log('▶ Running curation pipeline via Claude Code CLI (no API credits)…');
  if (args.isoWeek) console.log(`  isoWeek: ${args.isoWeek}`);
  console.log(`  ingest first: ${args.runIngestFirst}`);
  if (process.env['CLAUDE_CODE_MODEL']) {
    console.log(`  model: ${process.env['CLAUDE_CODE_MODEL']}`);
  }

  const result = await runWeeklyPipeline({
    ...(args.isoWeek ? { isoWeek: args.isoWeek } : {}),
    runIngestFirst: args.runIngestFirst,
    anthropicClient,
    renderFn: renderDigestEmail,
    logger: console,
  });

  console.log('\n✓ Pipeline complete');
  console.log(`  issueId:  ${result.issueId}`);
  console.log(`  isoWeek:  ${result.isoWeek}`);
  console.log(`  items:    ${result.itemCount}`);
  console.log(`  QA flags: ${result.qaFlags.length}`);
  console.log(`  costUsd:  ${result.costUsd} (API pricing basis; real spend was $0 via subscription)`);
}

main().catch((error: unknown) => {
  console.error('\n✗ Pipeline failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
