// ---------------------------------------------------------------------------
// Stage 4 — EDITOR / QA
// Model: claude-opus-4-8
// Fact-checks every claim against source excerpts, checks TR grammar/tone
// and brand voice. If issues found → loops back to Stage 3 (max MAX_QA_RETRIES).
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { MODEL_MAP, calcCostUsd } from './config.js';
import { callWithValidatedTool } from './llm-utils.js';
import type {
  ScoredCandidate,
  CopywriteOutput,
  QaOutput,
  QaFlag,
  StageOptions,
  PipelineRunRecord,
  TopicContext,
} from './types.js';

// ---------------------------------------------------------------------------
// Zod schema for LLM tool output
// ---------------------------------------------------------------------------

const QaFlagSchema = z.object({
  itemIndex: z.number().int().min(0),
  field: z.enum(['titleTr', 'summaryTr', 'factual']),
  issue: z.string().min(1),
  severity: z.enum(['warn', 'block']),
});

const QaOutputSchema = z.object({
  passed: z.boolean(),
  flags: z.array(QaFlagSchema),
  factCheckNotes: z.array(z.string()),
  feedbackForCopywrite: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Stage implementation
// ---------------------------------------------------------------------------

export interface EditorQaStageResult {
  readonly qaOutput: QaOutput;
  readonly pipelineRuns: readonly PipelineRunRecord[];
  /** Final copywrite output after any retries. */
  readonly finalCopywrite: CopywriteOutput;
  /** All QA flags accumulated over retries. */
  readonly allFlags: readonly QaFlag[];
}

/**
 * Build the Stage 4 EDITOR/QA system prompt for a topic.
 *
 * When `ctx.voice` is null, the brand-voice descriptor falls back verbatim to
 * the original hardcoded copy ("confident, clear, no hype"), so the default
 * `enterprise-ai` topic produces a byte-identical prompt.
 */
export function buildSystemPrompt(ctx: TopicContext): string {
  const voice = ctx.voice ?? 'confident, clear, no hype';
  const language = ctx.language ?? 'tr';

  if (language === 'en') {
    return `You are a senior editor and fact-checker for Mega Bilgisayar's English AI newsletter.

Your tasks:
1. FACT-CHECK: Verify every specific claim, number, date, or statistic in the English copy against the provided source excerpts.
   Flag anything that is not supported by the source or that appears exaggerated or inaccurate.

2. GRAMMAR & TONE: Check English grammar, spelling, and punctuation. Flag errors.
   Ensure the tone is professional and matches the brand voice (${voice}).

3. BRAND VOICE: Flag any hype words ("revolutionary", "game-changing", "unbelievable", "unparalleled", "groundbreaking", etc.),
   clickbait headlines, or off-brand language.

Severity levels:
- "block": The issue MUST be fixed before publication (factual error, serious grammar error, major brand violation).
- "warn": Should be improved but acceptable for publication (minor tone issue, mild wording suggestion).

If ALL flags are "warn" or there are no flags → set passed: true.
If ANY flag is "block" → set passed: false and include feedbackForCopywrite with specific correction instructions.`;
  }

  return `You are a senior editor and fact-checker for Mega Bilgisayar's Turkish AI newsletter.

Your tasks:
1. FACT-CHECK: Verify every specific claim, number, date, or statistic in the Turkish copy against the provided source excerpts.
   Flag anything that is not supported by the source or that appears exaggerated or inaccurate.

2. GRAMMAR & TONE: Check Turkish grammar, spelling, and punctuation. Flag errors.
   Ensure the tone is professional and matches the brand voice (${voice}).

3. BRAND VOICE: Flag any hype words ("devrimci", "çığır açan", "inanılmaz", "benzersiz", etc.),
   clickbait headlines, or off-brand language.

Severity levels:
- "block": The issue MUST be fixed before publication (factual error, serious grammar error, major brand violation).
- "warn": Should be improved but acceptable for publication (minor tone issue, mild wording suggestion).

If ALL flags are "warn" or there are no flags → set passed: true.
If ANY flag is "block" → set passed: false and include feedbackForCopywrite with specific correction instructions.`;
}

/**
 * Run a single QA pass (no retry logic here — handled by the caller).
 */
async function runSingleQaPass(
  candidates: readonly ScoredCandidate[],
  copywrite: CopywriteOutput,
  opts: StageOptions,
  passNumber: number,
): Promise<{ qaOutput: QaOutput; pipelineRun: PipelineRunRecord }> {
  const { client, repository, logger, issueId, topicContext } = opts;
  const model = MODEL_MAP['editor_qa'];
  const startedAt = new Date();

  logger.info('pipeline.editor_qa.pass', { passNumber });

  // Build context: pair each copy item with its source excerpt
  const contextList = copywrite.items
    .map((item, i) => {
      const candidate = candidates.find((c) => c.candidateId === item.candidateId);
      return `--- Item ${i + 1} ---\nSource excerpt: "${candidate?.rawExcerpt ?? '(no excerpt available)'}"\nTurkish title (titleTr): "${item.titleTr}"\nTurkish summary (summaryTr): "${item.summaryTr}"\nSource URL: ${item.sourceUrl}`;
    })
    .join('\n\n');

  const userMessage = `Please fact-check and review the following Turkish newsletter copy.\nIssue subject: "${copywrite.subject}"\nPreheader: "${copywrite.preheader}"\n\nItems:\n${contextList}`;

  let qaOutput: QaOutput;
  let inputTokens: number;
  let outputTokens: number;

  try {
    const result = await callWithValidatedTool({
      client,
      model,
      system: buildSystemPrompt(topicContext),
      userMessage,
      tool: {
        name: 'qa_review',
        description: 'Return QA review results with flags and fact-check notes.',
        inputSchema: {
          type: 'object',
          properties: {
            passed: {
              type: 'boolean',
              description:
                'True if all issues are warn-only or there are no issues. False if any block-severity issue found.',
            },
            flags: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  itemIndex: {
                    type: 'number',
                    description: '0-based index of the item (0, 1, or 2).',
                  },
                  field: { type: 'string', enum: ['titleTr', 'summaryTr', 'factual'] },
                  issue: { type: 'string', description: 'Description of the issue.' },
                  severity: { type: 'string', enum: ['warn', 'block'] },
                },
                required: ['itemIndex', 'field', 'issue', 'severity'],
              },
            },
            factCheckNotes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Fact-check observations per item (may be empty if all OK).',
            },
            feedbackForCopywrite: {
              type: 'string',
              description:
                'Specific correction instructions for the copywriter. Required if passed=false.',
            },
          },
          required: ['passed', 'flags', 'factCheckNotes'],
        },
      },
      schema: QaOutputSchema,
    });

    qaOutput = result.data;
    inputTokens = result.usage.inputTokens;
    outputTokens = result.usage.outputTokens;
  } catch (err: unknown) {
    const finishedAt = new Date();
    const run: PipelineRunRecord = {
      stage: 'editor_qa',
      model,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
      startedAt,
      finishedAt,
    };
    await repository.logPipelineRun({ ...run, topicId: topicContext.topicId, issueId });
    throw err;
  }

  const costUsd = calcCostUsd(model, inputTokens, outputTokens);
  const finishedAt = new Date();

  const run: PipelineRunRecord = {
    stage: 'editor_qa',
    model,
    tokensIn: inputTokens,
    tokensOut: outputTokens,
    costUsd,
    status: 'ok',
    error: undefined,
    startedAt,
    finishedAt,
  };

  await repository.logPipelineRun({ ...run, topicId: topicContext.topicId, issueId });

  logger.info('pipeline.editor_qa.pass.done', {
    passNumber,
    passed: qaOutput.passed,
    flagCount: qaOutput.flags.length,
    costUsd,
  });

  return { qaOutput, pipelineRun: run };
}

/**
 * Stage 4 — EDITOR/QA with retry loop.
 *
 * Runs QA → if failed → re-runs Stage 3 copywrite with feedback → re-runs QA.
 * Max retries controlled by the caller via `maxRetries` param.
 */
export async function runEditorQaStage(
  candidates: readonly ScoredCandidate[],
  initialCopywrite: CopywriteOutput,
  opts: StageOptions,
  maxRetries: number,
  copywriteFn: (
    candidates: readonly ScoredCandidate[],
    opts: StageOptions,
    qaFeedback: string,
  ) => Promise<{ output: CopywriteOutput; pipelineRun: PipelineRunRecord }>,
): Promise<EditorQaStageResult> {
  const pipelineRuns: PipelineRunRecord[] = [];
  const allFlags: QaFlag[] = [];
  let currentCopywrite = initialCopywrite;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { qaOutput, pipelineRun } = await runSingleQaPass(
      candidates,
      currentCopywrite,
      opts,
      attempt + 1,
    );

    pipelineRuns.push(pipelineRun);
    allFlags.push(...qaOutput.flags);

    if (qaOutput.passed || attempt === maxRetries) {
      return {
        qaOutput,
        pipelineRuns,
        finalCopywrite: currentCopywrite,
        allFlags,
      };
    }

    // QA failed → retry copywrite with feedback
    const feedback = qaOutput.feedbackForCopywrite ?? 'Please review and fix all flagged issues.';
    opts.logger.info('pipeline.editor_qa.retry', { attempt: attempt + 1, feedback });

    const retryResult = await copywriteFn(candidates, opts, feedback);
    pipelineRuns.push(retryResult.pipelineRun);
    currentCopywrite = retryResult.output;
  }

  // This point is unreachable (the loop always returns above), but TypeScript needs it.
  throw new Error('runEditorQaStage: unexpected loop exit');
}
