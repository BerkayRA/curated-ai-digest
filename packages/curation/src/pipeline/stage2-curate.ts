// ---------------------------------------------------------------------------
// Stage 2 — CURATE
// Model: claude-opus-4-8
// Selects top 2–3 articles enforcing topical diversity, drops near-duplicates.
// Marks chosen CandidateArticle rows as 'selected'.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { MODEL_MAP, calcCostUsd } from './config.js';
import { callWithValidatedTool } from './llm-utils.js';
import type { ScoredCandidate, CurateSelection, StageOptions, PipelineRunRecord } from './types.js';

// ---------------------------------------------------------------------------
// Zod schema for LLM tool output
// ---------------------------------------------------------------------------

const CurateOutputSchema = z.object({
  selectedIds: z
    .array(z.string())
    .min(2, 'Must select at least 2 articles')
    .max(3, 'Must select at most 3 articles'),
  justification: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Stage implementation
// ---------------------------------------------------------------------------

export interface CurateStageResult {
  readonly selection: CurateSelection;
  readonly selectedCandidates: readonly ScoredCandidate[];
  readonly pipelineRun: PipelineRunRecord;
}

const SYSTEM_PROMPT = `You are a senior editorial AI for Mega Bilgisayar's weekly AI newsletter.
Your task: select exactly 2 or 3 of the provided articles for inclusion in this week's issue.

Selection criteria:
1. Prioritise articles with high importance AND relevance to Turkish IT professionals.
2. Enforce topical diversity - do not pick two articles about the same company, model, or event.
3. Drop near-duplicates - if two articles cover the same story, pick the better one.
4. Aim for a mix of: major product/model news, research breakthroughs, and enterprise/business impact.
5. You MUST select 2 or 3 articles - no more, no fewer.

Return the exact article ids as provided.`;

/**
 * Stage 2 — CURATE
 *
 * Picks 2-3 articles from scored candidates, persists 'selected' status.
 */
export async function runCurateStage(
  candidates: readonly ScoredCandidate[],
  opts: StageOptions,
): Promise<CurateStageResult> {
  const { client, repository, logger, issueId } = opts;
  const model = MODEL_MAP['curate'];
  const startedAt = new Date();

  logger.info('pipeline.curate.start', { candidateCount: candidates.length });

  if (candidates.length < 2) {
    const finishedAt = new Date();
    const run: PipelineRunRecord = {
      stage: 'curate',
      model,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      status: 'error',
      error: `Not enough candidates to curate: need >=2, got ${candidates.length}`,
      startedAt,
      finishedAt,
    };
    await repository.logPipelineRun({ ...run, issueId });
    throw new Error(run.error);
  }

  const articleList = candidates
    .map((c) => {
      const excerpt = c.rawExcerpt ?? '(none)';
      return [
        `id: "${c.candidateId}"`,
        `  title: "${c.title}"`,
        `  source: "${c.sourceName}"`,
        `  importanceScore: ${c.importanceScore.toFixed(2)}`,
        `  relevanceScore: ${c.relevanceScore.toFixed(2)}`,
        `  excerpt: "${excerpt}"`,
      ].join('\n');
    })
    .join('\n\n');

  const userMessage =
    `Select 2 or 3 articles for this week's issue from the following ` +
    `${candidates.length} candidates (sorted by combined score):\n\n${articleList}`;

  let selection: CurateSelection;
  let inputTokens: number;
  let outputTokens: number;

  try {
    const result = await callWithValidatedTool({
      client,
      model,
      system: SYSTEM_PROMPT,
      userMessage,
      tool: {
        name: 'select_articles',
        description: 'Return the selected article ids (2 or 3) and justification.',
        inputSchema: {
          type: 'object',
          properties: {
            selectedIds: {
              type: 'array',
              items: { type: 'string' },
              minItems: 2,
              maxItems: 3,
              description: "Exactly 2 or 3 article ids to include in this week's issue.",
            },
            justification: {
              type: 'string',
              description: 'Brief editorial justification for the selection and diversity rationale.',
            },
          },
          required: ['selectedIds', 'justification'],
        },
      },
      schema: CurateOutputSchema,
    });

    selection = result.data;
    inputTokens = result.usage.inputTokens;
    outputTokens = result.usage.outputTokens;
  } catch (err: unknown) {
    const finishedAt = new Date();
    const run: PipelineRunRecord = {
      stage: 'curate',
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

  // Validate that returned ids exist in candidates
  const candidateMap = new Map(candidates.map((c) => [c.candidateId, c]));
  const validIds = selection.selectedIds.filter((id) => candidateMap.has(id));

  if (validIds.length < 2) {
    const finishedAt = new Date();
    const run: PipelineRunRecord = {
      stage: 'curate',
      model,
      tokensIn: inputTokens,
      tokensOut: outputTokens,
      costUsd: calcCostUsd(model, inputTokens, outputTokens),
      status: 'error',
      error: `Model returned invalid article ids: ${selection.selectedIds.join(', ')}`,
      startedAt,
      finishedAt,
    };
    await repository.logPipelineRun({ ...run, issueId });
    throw new Error(run.error);
  }

  // Persist selection status
  await repository.selectCandidates(validIds);

  const selectedCandidates = validIds
    .map((id) => candidateMap.get(id))
    .filter((c): c is ScoredCandidate => c !== undefined);

  const costUsd = calcCostUsd(model, inputTokens, outputTokens);
  const finishedAt = new Date();

  const run: PipelineRunRecord = {
    stage: 'curate',
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

  logger.info('pipeline.curate.done', {
    selected: validIds.length,
    justification: selection.justification,
    costUsd,
  });

  return {
    selection: { selectedIds: validIds, justification: selection.justification },
    selectedCandidates,
    pipelineRun: run,
  };
}
