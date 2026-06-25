// ---------------------------------------------------------------------------
// Stage 1 — RANK
// Model: claude-sonnet-4-6
// Scores each CandidateArticle for relevance to Mega's TR audience and global
// importance. Writes importanceScore / relevanceScore back to the DB.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import type { CandidateArticle } from '@digest/db';
import { MODEL_MAP, calcCostUsd } from './config.js';
import { callWithValidatedTool } from './llm-utils.js';
import type {
  ScoredCandidate,
  StageOptions,
  PipelineRunRecord,
  TopicContext,
} from './types.js';

// ---------------------------------------------------------------------------
// Zod schema for LLM tool output
// ---------------------------------------------------------------------------

const RankItemSchema = z.object({
  id: z.string().min(1),
  importanceScore: z.number().min(0).max(1),
  relevanceScore: z.number().min(0).max(1),
  rationale: z.string().min(1),
});

const RankOutputSchema = z.object({
  scores: z.array(RankItemSchema).min(1),
});

type RankOutput = z.infer<typeof RankOutputSchema>;

// ---------------------------------------------------------------------------
// Stage implementation
// ---------------------------------------------------------------------------

export interface RankStageResult {
  readonly scored: readonly ScoredCandidate[];
  readonly pipelineRun: PipelineRunRecord;
}

/**
 * Build the Stage 1 RANK system prompt for a topic.
 *
 * When `ctx.audience` is null, the relevance description falls back verbatim to
 * the original hardcoded copy, so the default `enterprise-ai` topic produces a
 * byte-identical prompt.
 */
export function buildSystemPrompt(ctx: TopicContext): string {
  const audienceBlock =
    ctx.audience ??
    `Mega Bilgisayar's Turkish customer/prospect audience.
   - These are Turkish IT professionals, CIOs, and business decision-makers at mid-to-large companies.
   - High relevance: enterprise AI tools, productivity AI, security AI, cloud AI services, AI regulation affecting EU/TR businesses.
   - Low relevance: consumer apps, highly academic papers, US-specific policy with no TR impact.`;

  return `You are an editorial AI assistant for Mega Bilgisayar, a Turkish B2B IT company.
Your task is to score AI-news articles for two dimensions:

1. importanceScore (0.0–1.0): Global significance of the development.
   - 1.0 = major breakthrough, new model release, landmark research, regulatory milestone
   - 0.5 = solid industry news with moderate impact
   - 0.0 = minor update, opinion piece, low-signal rumour

2. relevanceScore (0.0–1.0): Relevance to ${audienceBlock}

Score precisely and consistently. Brief rationale required for each item.`;
}

/**
 * Stage 1 — RANK
 *
 * Scores all candidates and persists updated scores to the DB.
 * Returns ScoredCandidate[] sorted by combined score descending.
 */
export async function runRankStage(
  candidates: readonly CandidateArticle[],
  opts: StageOptions,
): Promise<RankStageResult> {
  const { client, repository, logger, issueId, topicContext } = opts;
  const model = MODEL_MAP['rank'];
  const startedAt = new Date();

  logger.info('pipeline.rank.start', { candidateCount: candidates.length });

  if (candidates.length === 0) {
    const finishedAt = new Date();
    const run: PipelineRunRecord = {
      stage: 'rank',
      model,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      status: 'ok',
      error: undefined,
      startedAt,
      finishedAt,
    };
    await repository.logPipelineRun({ ...run, topicId: topicContext.topicId, issueId });
    return { scored: [], pipelineRun: run };
  }

  const articleList = candidates
    .map(
      (c, i) =>
        `Article ${i + 1}:\n  id: "${c.id}"\n  title: "${c.title}"\n  source: "${c.sourceName}"\n  excerpt: "${c.rawExcerpt ?? '(none)'}"\n  published: "${c.publishedAt?.toISOString() ?? 'unknown'}"`,
    )
    .join('\n\n');

  const userMessage = `Please score the following ${candidates.length} article(s) for importanceScore and relevanceScore.\n\n${articleList}`;

  let rankOutput: RankOutput;
  let inputTokens: number;
  let outputTokens: number;

  try {
    const result = await callWithValidatedTool({
      client,
      model,
      system: buildSystemPrompt(topicContext),
      userMessage,
      tool: {
        name: 'score_articles',
        description: 'Return importance and relevance scores for each article.',
        inputSchema: {
          type: 'object',
          properties: {
            scores: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'The article id exactly as given.' },
                  importanceScore: { type: 'number', minimum: 0, maximum: 1 },
                  relevanceScore: { type: 'number', minimum: 0, maximum: 1 },
                  rationale: { type: 'string' },
                },
                required: ['id', 'importanceScore', 'relevanceScore', 'rationale'],
              },
            },
          },
          required: ['scores'],
        },
      },
      schema: RankOutputSchema,
    });

    rankOutput = result.data;
    inputTokens = result.usage.inputTokens;
    outputTokens = result.usage.outputTokens;
  } catch (err: unknown) {
    const finishedAt = new Date();
    const run: PipelineRunRecord = {
      stage: 'rank',
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

  // Build score map from LLM output
  const scoreMap = new Map<string, { importanceScore: number; relevanceScore: number }>(
    rankOutput.scores.map((s) => [s.id, { importanceScore: s.importanceScore, relevanceScore: s.relevanceScore }]),
  );

  // Persist scores back to DB
  const updates = candidates
    .map((c) => {
      const scores = scoreMap.get(c.id);
      return scores
        ? { id: c.id, importanceScore: scores.importanceScore, relevanceScore: scores.relevanceScore }
        : null;
    })
    .filter((u): u is { id: string; importanceScore: number; relevanceScore: number } => u !== null);

  await repository.updateScores(updates);

  // Build ScoredCandidate array, sorted by combined score
  const scored: ScoredCandidate[] = candidates.map((c) => {
    const scores = scoreMap.get(c.id) ?? { importanceScore: 0, relevanceScore: 0 };
    return {
      candidateId: c.id,
      title: c.title,
      sourceUrl: c.sourceUrl,
      sourceName: c.sourceName,
      rawExcerpt: c.rawExcerpt ?? undefined,
      importanceScore: scores.importanceScore,
      relevanceScore: scores.relevanceScore,
    };
  });

  scored.sort((a, b) => b.importanceScore + b.relevanceScore - (a.importanceScore + a.relevanceScore));

  const costUsd = calcCostUsd(model, inputTokens, outputTokens);
  const finishedAt = new Date();

  const run: PipelineRunRecord = {
    stage: 'rank',
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

  logger.info('pipeline.rank.done', { scored: scored.length, costUsd });

  return { scored, pipelineRun: run };
}
