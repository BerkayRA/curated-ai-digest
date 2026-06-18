// ---------------------------------------------------------------------------
// Stage 3 — COPYWRITE
// Model: claude-opus-4-8
// Writes Turkish marketing-grade summaries + titles for each selected article,
// plus the issue subject line and preheader.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { MODEL_MAP, calcCostUsd } from './config.js';
import { callWithValidatedTool } from './llm-utils.js';
import type { ScoredCandidate, CopywriteOutput, StageOptions, PipelineRunRecord } from './types.js';

// ---------------------------------------------------------------------------
// Zod schema for LLM tool output
// ---------------------------------------------------------------------------

const CopiedItemSchema = z.object({
  candidateId: z.string().min(1),
  titleTr: z.string().min(5).max(120),
  summaryTr: z.string().min(50).max(600),
  sourceUrl: z.string().url(),
  sourceName: z.string().min(1),
});

const CopywriteOutputSchema = z.object({
  items: z.array(CopiedItemSchema).min(2).max(3),
  subject: z.string().min(5).max(90),
  preheader: z.string().min(5).max(130),
});

// ---------------------------------------------------------------------------
// Stage implementation
// ---------------------------------------------------------------------------

export interface CopywriteStageResult {
  readonly output: CopywriteOutput;
  readonly pipelineRun: PipelineRunRecord;
}

const SYSTEM_PROMPT = `You are a senior Turkish copywriter for Mega Bilgisayar's weekly AI newsletter.

Brand voice:
- Language: Turkish (TR)
- Tone: Confident, clear, professional — like a knowledgeable colleague sharing a finding, not a salesperson.
- No hype, no clickbait, no exclamation marks. Avoid "devrimci", "çığır açan", "inanılmaz" and similar superlatives.
- Cite the source naturally within the summary (e.g. "MIT Technology Review'a göre…" or "OpenAI'ın açıkladığına göre…").
- Summaries should provide genuine insight, not just restate the headline.

Deliverables per article:
- titleTr: A concise Turkish title (max 120 chars). This is a title, not a sentence — no period at end.
- summaryTr: A 2–4 sentence Turkish summary (50–600 chars). Explain what happened, why it matters for the reader.

Deliverables for the issue:
- subject: A compelling Turkish email subject line (max 90 chars). No emojis. Should entice opening.
- preheader: Preview text (max 130 chars) that complements the subject and hints at content.`;

/**
 * Stage 3 — COPYWRITE
 *
 * Generates Turkish marketing copy for all selected articles plus the issue envelope.
 * Accepts optional QA feedback for retry loops.
 */
export async function runCopywriteStage(
  candidates: readonly ScoredCandidate[],
  opts: StageOptions,
  qaFeedback?: string,
): Promise<CopywriteStageResult> {
  const { client, repository, logger, issueId } = opts;
  const model = MODEL_MAP['copywrite'];
  const startedAt = new Date();

  logger.info('pipeline.copywrite.start', {
    itemCount: candidates.length,
    isRetry: qaFeedback !== undefined,
  });

  const articleList = candidates
    .map((c, i) => {
      const excerpt = c.rawExcerpt ?? '(none)';
      return [
        `Item ${i + 1}:`,
        `  candidateId: "${c.candidateId}"`,
        `  title (EN): "${c.title}"`,
        `  source: "${c.sourceName}" (${c.sourceUrl})`,
        `  excerpt: "${excerpt}"`,
      ].join('\n');
    })
    .join('\n\n');

  const feedbackSection = qaFeedback
    ? `\n\nQA FEEDBACK (address all points in your revised copy):\n${qaFeedback}`
    : '';

  const userMessage = `Write Turkish marketing copy for the following ${candidates.length} selected AI-news article(s). Also write the issue subject and preheader.${feedbackSection}\n\nArticles:\n${articleList}`;

  let output: CopywriteOutput;
  let inputTokens: number;
  let outputTokens: number;

  try {
    const result = await callWithValidatedTool({
      client,
      model,
      system: SYSTEM_PROMPT,
      userMessage,
      tool: {
        name: 'write_copy',
        description: 'Return Turkish marketing copy for all articles plus the issue subject and preheader.',
        inputSchema: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              minItems: 2,
              maxItems: 3,
              items: {
                type: 'object',
                properties: {
                  candidateId: { type: 'string' },
                  titleTr: { type: 'string', maxLength: 120 },
                  summaryTr: { type: 'string', minLength: 50, maxLength: 600 },
                  sourceUrl: { type: 'string' },
                  sourceName: { type: 'string' },
                },
                required: ['candidateId', 'titleTr', 'summaryTr', 'sourceUrl', 'sourceName'],
              },
            },
            subject: { type: 'string', maxLength: 90 },
            preheader: { type: 'string', maxLength: 130 },
          },
          required: ['items', 'subject', 'preheader'],
        },
      },
      schema: CopywriteOutputSchema,
    });

    output = result.data;
    inputTokens = result.usage.inputTokens;
    outputTokens = result.usage.outputTokens;
  } catch (err: unknown) {
    const finishedAt = new Date();
    const run: PipelineRunRecord = {
      stage: 'copywrite',
      model,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
      startedAt,
      finishedAt,
    };
    await repository.logPipelineRun({ ...run, issueId });
    throw err;
  }

  const costUsd = calcCostUsd(model, inputTokens, outputTokens);
  const finishedAt = new Date();

  const run: PipelineRunRecord = {
    stage: 'copywrite',
    model,
    tokensIn: inputTokens,
    tokensOut: outputTokens,
    costUsd,
    status: 'ok',
    error: undefined,
    startedAt,
    finishedAt,
  };

  await repository.logPipelineRun({ ...run, issueId });

  logger.info('pipeline.copywrite.done', { itemCount: output.items.length, costUsd });

  return { output, pipelineRun: run };
}
