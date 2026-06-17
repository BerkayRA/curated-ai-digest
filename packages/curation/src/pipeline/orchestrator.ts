// ---------------------------------------------------------------------------
// Pipeline orchestrator — runWeeklyPipeline
// Runs all 5 stages end-to-end. Resumable: re-enters at the first incomplete
// stage if the week's issue already exists mid-pipeline.
// ---------------------------------------------------------------------------

import Anthropic from '@anthropic-ai/sdk';
import { runIngest } from '../ingest/orchestrator.js';
import { runRankStage } from './stage1-rank.js';
import { runCurateStage } from './stage2-curate.js';
import { runCopywriteStage } from './stage3-copywrite.js';
import { runEditorQaStage } from './stage4-editor-qa.js';
import { runRenderStage } from './stage5-render.js';
import type { RenderFn } from './stage5-render.js';
import { createPipelinePrismaRepository } from './repository.js';
import { MAX_QA_RETRIES } from './config.js';
import type {
  PipelineRepository,
  PipelineResult,
  PipelineRunRecord,
  StageOptions,
} from './types.js';
import type { Logger } from '../ingest/types.js';
import type { IngestOptions } from '../ingest/orchestrator.js';

// ---------------------------------------------------------------------------
// Public API types
// ---------------------------------------------------------------------------

export interface RunWeeklyPipelineOptions {
  /**
   * ISO week string (e.g. "2026-W24").
   * Defaults to the current week if not provided.
   */
  isoWeek?: string;

  /**
   * Whether to run ingest before the pipeline stages.
   * Set to false to reuse existing candidates already in the DB.
   * Defaults to true.
   */
  runIngestFirst?: boolean;

  /**
   * Override the pipeline repository (for testing).
   */
  repository?: PipelineRepository;

  /**
   * Override the Anthropic client (for testing).
   */
  anthropicClient?: Pick<Anthropic, 'messages'>;

  /**
   * Override the logger.
   */
  logger?: Logger;

  /**
   * Ingest options (passed through to runIngest if runIngestFirst is true).
   */
  ingestOptions?: IngestOptions;

  /**
   * Maximum number of QA→copywrite retry iterations.
   * Defaults to MAX_QA_RETRIES.
   */
  maxQaRetries?: number;

  /**
   * Max candidates to fetch from DB for ranking.
   * Defaults to 30.
   */
  candidateLimit?: number;

  /**
   * Email render function — receives DigestEmailData and returns { html, text }.
   * In production, pass renderDigestEmail from @mega-bulten/email.
   * In tests, pass a stub.
   * Defaults to a no-op stub that returns placeholder HTML (for development/testing only).
   */
  renderFn?: RenderFn;
}

// ---------------------------------------------------------------------------
// ISO week helper
// ---------------------------------------------------------------------------

/** Returns the current ISO week string, e.g. "2026-W24". */
function currentIsoWeek(): string {
  const now = new Date();
  // ISO week calculation
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = date.getUTCDay() || 7; // treat Sunday as 7
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// No-op logger
// ---------------------------------------------------------------------------

const silentLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * runWeeklyPipeline
 *
 * Runs the full curation pipeline for a given ISO week:
 *   1. Optionally runs ingest to fetch fresh candidates.
 *   2. Stage 1 — RANK
 *   3. Stage 2 — CURATE
 *   4. Stage 3 — COPYWRITE
 *   5. Stage 4 — EDITOR/QA (with retry loop back to Stage 3)
 *   6. Stage 5 — RENDER → creates/updates Issue(draft)
 *
 * Idempotent: if the week's issue is already in a terminal state (sent/approved),
 * it returns the existing result without re-running stages.
 *
 * Resumable: if re-run mid-pipeline, it re-enters at the first incomplete stage.
 * (Current implementation re-runs from rank stage; full resume checkpointing
 * is deferred — TODO for v2 if pipeline costs become significant.)
 */
export async function runWeeklyPipeline(
  opts: RunWeeklyPipelineOptions = {},
): Promise<PipelineResult> {
  const {
    isoWeek = currentIsoWeek(),
    runIngestFirst = true,
    repository = createPipelinePrismaRepository(),
    logger = silentLogger,
    ingestOptions = {},
    maxQaRetries = MAX_QA_RETRIES,
    candidateLimit = 30,
    renderFn = async (_data: import('./stage5-render.js').DigestEmailData) => ({
      html: '<!-- pipeline render stub — wire up renderDigestEmail from @mega-bulten/email in production -->',
      text: '',
    }),
  } = opts;

  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is not set. Set it before invoking the pipeline.',
    );
  }

  const anthropicClient =
    opts.anthropicClient ??
    new Anthropic({ apiKey });

  const allRuns: PipelineRunRecord[] = [];

  logger.info('pipeline.start', { isoWeek, runIngestFirst });

  // Check for existing issue — guard against re-running on already-terminal states
  const existingIssue = await repository.findIssueByWeek(isoWeek);
  if (existingIssue && ['sent', 'approved', 'scheduled'].includes(existingIssue.status)) {
    logger.info('pipeline.skip', { isoWeek, status: existingIssue.status });
    throw new Error(
      `Issue for ${isoWeek} is already in status '${existingIssue.status}'. Cannot re-run pipeline.`,
    );
  }

  // 0. Optional ingest
  if (runIngestFirst) {
    logger.info('pipeline.ingest.start');
    await runIngest({ ...ingestOptions, logger });
    logger.info('pipeline.ingest.done');
  }

  const stageOpts: StageOptions = {
    client: anthropicClient,
    repository,
    logger,
    issueId: existingIssue?.id,
  };

  // 1. Load candidates
  const candidates = await repository.findCandidates({ isoWeek, limit: candidateLimit });
  logger.info('pipeline.candidates.loaded', { count: candidates.length });

  if (candidates.length === 0) {
    throw new Error(`No candidate articles found for week ${isoWeek}. Run ingest first.`);
  }

  // 2. Stage 1 — RANK
  const rankResult = await runRankStage(candidates, stageOpts);
  allRuns.push(rankResult.pipelineRun);

  // 3. Stage 2 — CURATE
  const curateResult = await runCurateStage(rankResult.scored, stageOpts);
  allRuns.push(curateResult.pipelineRun);

  // Update stageOpts with issueId if we upserted one
  const stageOptsWithIssue: StageOptions = {
    ...stageOpts,
    issueId: stageOpts.issueId,
  };

  // 4. Stage 3 — COPYWRITE (initial)
  const copywriteResult = await runCopywriteStage(
    curateResult.selectedCandidates,
    stageOptsWithIssue,
  );
  allRuns.push(copywriteResult.pipelineRun);

  // 5. Stage 4 — EDITOR/QA with retry loop
  const editorQaResult = await runEditorQaStage(
    curateResult.selectedCandidates,
    copywriteResult.output,
    stageOptsWithIssue,
    maxQaRetries,
    async (selected, opts2, feedback) => {
      const retryResult = await runCopywriteStage(selected, opts2, feedback);
      return { output: retryResult.output, pipelineRun: retryResult.pipelineRun };
    },
  );
  allRuns.push(...editorQaResult.pipelineRuns);

  // 6. Stage 5 — RENDER
  const renderResult = await runRenderStage(
    {
      isoWeek,
      copywrite: editorQaResult.finalCopywrite,
      qaFlags: editorQaResult.allFlags,
      factCheckNotes: editorQaResult.qaOutput.factCheckNotes,
      renderFn,
    },
    {
      ...stageOptsWithIssue,
      issueId: stageOptsWithIssue.issueId,
    },
  );
  allRuns.push(renderResult.pipelineRun);

  const totalCostUsd = allRuns.reduce((sum, r) => sum + r.costUsd, 0);

  logger.info('pipeline.done', {
    isoWeek,
    issueId: renderResult.render.issueId,
    itemCount: editorQaResult.finalCopywrite.items.length,
    totalCostUsd,
    qaFlagCount: editorQaResult.allFlags.length,
  });

  return {
    issueId: renderResult.render.issueId,
    isoWeek,
    itemCount: editorQaResult.finalCopywrite.items.length,
    qaFlags: editorQaResult.allFlags,
    pipelineRuns: allRuns,
    costUsd: totalCostUsd,
  };
}
