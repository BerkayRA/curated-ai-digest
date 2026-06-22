// ---------------------------------------------------------------------------
// Manual curation CLI — no API key required
//
// Subcommands:
//   list    — print the live candidate pool (grouped by source) for review
//   draft   — persist a curated selection JSON as a draft Issue
//
// Run via:
//   pnpm --filter @digest/worker curate:manual list [--source <substr>] [--limit <n>]
//   pnpm --filter @digest/worker curate:manual draft <selection.json>
// ---------------------------------------------------------------------------

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Exported pure helpers — unit-testable without any CLI / DB side effects
// ---------------------------------------------------------------------------

/**
 * Zod schema for the selection JSON file passed to `draft`.
 * Validates structure, string non-emptiness, URL format, and optional isoWeek.
 */
export const selectionItemSchema = z.object({
  titleTr: z.string().min(1, 'titleTr must not be empty'),
  summaryTr: z.string().min(1, 'summaryTr must not be empty'),
  sourceUrl: z.string().url('sourceUrl must be a valid URL'),
  sourceName: z.string().min(1, 'sourceName must not be empty'),
});

export const selectionSchema = z.object({
  subject: z.string().min(1, 'subject must not be empty'),
  preheader: z.string().min(1, 'preheader must not be empty'),
  isoWeek: z
    .string()
    .regex(/^\d{4}-W\d{2}$/, 'isoWeek must match YYYY-Wnn (e.g. 2026-W25)')
    .optional(),
  items: z
    .array(selectionItemSchema)
    .min(2, 'selection must contain at least 2 items')
    .max(3, 'selection must contain at most 3 items'),
});

export type SelectionInput = z.infer<typeof selectionSchema>;

/**
 * Returns the given isoWeek if provided, otherwise computes the current ISO week.
 * ISO 8601: weeks start on Monday, week 1 contains the first Thursday of the year.
 */
export function resolveIsoWeek(isoWeek: string | undefined): string {
  if (isoWeek !== undefined) return isoWeek;

  const now = new Date();
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// CLI side-effects — only executed when this module is the entry point
// ---------------------------------------------------------------------------

/** Print usage to stderr and exit 1. */
function printUsageAndExit(): never {
  process.stderr.write(
    [
      'Usage:',
      '  pnpm --filter @digest/worker curate:manual list [--source <substr>] [--limit <n>]',
      '  pnpm --filter @digest/worker curate:manual draft <selection.json>',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

/** Build a stderr-only logger for the CLI. */
function makeStderrLogger() {
  return {
    debug: (msg: string, meta?: Record<string, unknown>) =>
      process.stderr.write(`[debug] ${msg}${meta ? ' ' + JSON.stringify(meta) : ''}\n`),
    info: (msg: string, meta?: Record<string, unknown>) =>
      process.stderr.write(`[info]  ${msg}${meta ? ' ' + JSON.stringify(meta) : ''}\n`),
    warn: (msg: string, meta?: Record<string, unknown>) =>
      process.stderr.write(`[warn]  ${msg}${meta ? ' ' + JSON.stringify(meta) : ''}\n`),
    error: (msg: string, meta?: Record<string, unknown>) =>
      process.stderr.write(`[error] ${msg}${meta ? ' ' + JSON.stringify(meta) : ''}\n`),
  };
}

// ---------------------------------------------------------------------------
// list subcommand
// ---------------------------------------------------------------------------

async function runList(args: readonly string[]): Promise<void> {
  const logger = makeStderrLogger();

  // Parse --source and --limit flags
  let sourceFilter: string | undefined;
  let limitN: number | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' && args[i + 1] !== undefined) {
      sourceFilter = args[i + 1];
      i++;
    } else if (args[i] === '--limit' && args[i + 1] !== undefined) {
      const parsed = parseInt(args[i + 1] ?? '', 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        limitN = parsed;
      }
      i++;
    }
  }

  // Resolve candidates directory
  const initCwd = process.env['INIT_CWD'] ?? process.cwd();
  const candidatesEnv = process.env['CANDIDATES_DIR'];
  const candidatesDir = candidatesEnv
    ? path.resolve(initCwd, candidatesEnv)
    : path.resolve(initCwd, 'data/candidates');

  // Dynamic import to avoid circular deps and keep the module testable without @digest/curation
  const { readPool } = await import('@digest/curation');

  logger.info('manual-curate.list.start', { candidatesDir });

  const pool = await readPool(candidatesDir);

  if (pool.length === 0) {
    process.stderr.write('No candidates found in the pool.\n');
    return;
  }

  // Apply source filter
  const filtered = sourceFilter
    ? pool.filter((c) => c.sourceName.toLowerCase().includes(sourceFilter!.toLowerCase()))
    : pool;

  // Apply limit
  const limited = limitN !== undefined ? filtered.slice(0, limitN) : filtered;

  // Group by sourceName (stable order of first appearance)
  const groups = new Map<string, typeof limited>();
  for (const c of limited) {
    const existing = groups.get(c.sourceName);
    if (existing !== undefined) {
      existing.push(c);
    } else {
      groups.set(c.sourceName, [c]);
    }
  }

  let globalIndex = 0;

  for (const [sourceName, items] of groups) {
    process.stdout.write(`\n── ${sourceName} ──\n`);
    for (const item of items) {
      const excerpt = item.rawExcerpt
        ? item.rawExcerpt.slice(0, 140).replace(/\n/g, ' ')
        : '(no excerpt)';
      process.stdout.write(
        `  [${globalIndex}] ${item.title}\n` +
          `       ${item.sourceUrl}\n` +
          `       ${excerpt}\n`,
      );
      globalIndex++;
    }
  }

  process.stdout.write(`\nTotal shown: ${limited.length} of ${pool.length} candidates.\n`);
}

// ---------------------------------------------------------------------------
// draft subcommand
// ---------------------------------------------------------------------------

async function runDraft(args: readonly string[]): Promise<void> {
  const logger = makeStderrLogger();

  const filePath = args[0];
  if (filePath === undefined || filePath.startsWith('--')) {
    process.stderr.write('Error: draft requires a path to a selection JSON file.\n');
    printUsageAndExit();
  }

  // Read + parse JSON
  let rawContent: string;
  try {
    rawContent = await fs.readFile(filePath, 'utf8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: could not read selection file "${filePath}": ${msg}\n`);
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: selection file is not valid JSON: ${msg}\n`);
    process.exit(1);
  }

  // Validate with Zod
  const result = selectionSchema.safeParse(parsed);
  if (!result.success) {
    process.stderr.write('Error: selection file validation failed:\n');
    for (const issue of result.error.issues) {
      process.stderr.write(`  - ${issue.path.join('.')}: ${issue.message}\n`);
    }
    process.exit(1);
  }

  const selection = result.data;
  const isoWeek = resolveIsoWeek(selection.isoWeek);

  logger.info('manual-curate.draft.start', { isoWeek, items: selection.items.length });

  // Build CopywriteOutput (candidateId is empty — no LLM pipeline)
  const copywrite = {
    subject: selection.subject,
    preheader: selection.preheader,
    items: selection.items.map((item) => ({
      candidateId: '',
      titleTr: item.titleTr,
      summaryTr: item.summaryTr,
      sourceUrl: item.sourceUrl,
      sourceName: item.sourceName,
    })),
  } as const;

  // Dynamic imports keep this module independently testable
  const { runRenderStage, createPipelinePrismaRepository } = await import('@digest/curation');
  const { renderDigestEmail } = await import('@digest/email');

  const repository = createPipelinePrismaRepository();

  const { render } = await runRenderStage(
    {
      isoWeek,
      copywrite,
      qaFlags: [],
      factCheckNotes: [],
      renderFn: renderDigestEmail,
    },
    {
      // Stage 5 never uses client — pass a placeholder to satisfy the type
      client: undefined as never,
      repository,
      logger,
    },
  );

  // Machine-readable result on stdout; all logs already went to stderr
  process.stdout.write(
    JSON.stringify({ issueId: render.issueId, isoWeek: render.isoWeek, status: 'draft' }) + '\n',
  );
  process.stderr.write(`Draft persisted — issueId=${render.issueId}  isoWeek=${render.isoWeek}\n`);
}

// ---------------------------------------------------------------------------
// Entry point — only runs when invoked directly (not when imported in tests)
// ---------------------------------------------------------------------------

const isMain =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('manual-curate.ts') ||
    process.argv[1].endsWith('manual-curate.js'));

if (isMain) {
  const [, , subcommand, ...rest] = process.argv;

  void (async () => {
    try {
      if (subcommand === 'list') {
        await runList(rest);
      } else if (subcommand === 'draft') {
        await runDraft(rest);
      } else {
        printUsageAndExit();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Fatal: ${msg}\n`);
      process.exit(1);
    }
  })();
}
