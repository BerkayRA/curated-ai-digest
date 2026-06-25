import { describe, it, expect, vi } from 'vitest';
import { runRankStage, buildSystemPrompt } from '../pipeline/stage1-rank.js';
import type { StageOptions, PipelineRepository, TopicContext } from '../pipeline/types.js';
import type { Logger } from '../ingest/types.js';
import type { CandidateArticle } from '@digest/db';
import type { AnthropicClient } from '../pipeline/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const noopLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

// enterprise-ai-like context: name set, audience/voice null (default copy).
const topicContext: TopicContext = {
  topicId: 'topic_enterprise_ai',
  name: 'on-prem & enterprise AI workflows',
  audience: null,
  voice: null,
};

function makeRepo(overrides: Partial<PipelineRepository> = {}): PipelineRepository {
  return {
    findCandidates: vi.fn().mockResolvedValue([]),
    updateScores: vi.fn().mockResolvedValue(undefined),
    selectCandidates: vi.fn().mockResolvedValue(undefined),
    upsertIssue: vi.fn().mockResolvedValue('issue-1'),
    upsertIssueItems: vi.fn().mockResolvedValue(undefined),
    updateIssueBody: vi.fn().mockResolvedValue(undefined),
    logPipelineRun: vi.fn().mockResolvedValue('run-1'),
    findIssueByWeek: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function makeArticle(id: string, title: string): CandidateArticle {
  return {
    id,
    topicId: 'topic_enterprise_ai',
    sourceUrl: `https://example.com/${id}`,
    sourceName: 'Test Source',
    title,
    rawExcerpt: 'Test excerpt',
    publishedAt: new Date('2026-06-01'),
    contentHash: `hash-${id}`,
    importanceScore: null,
    relevanceScore: null,
    status: 'candidate',
    fetchedAt: new Date(),
    ingestRunId: null,
  };
}

function makeClient(scores: Array<{ id: string; importanceScore: number; relevanceScore: number }>): AnthropicClient {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'tool_use',
            id: 'tu_1',
            name: 'score_articles',
            input: {
              scores: scores.map((s) => ({
                ...s,
                rationale: 'Test rationale',
              })),
            },
          },
        ],
        usage: { input_tokens: 200, output_tokens: 100 },
      }),
    },
  } as unknown as AnthropicClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runRankStage', () => {
  it('returns empty scored array and logs run when no candidates', async () => {
    const repo = makeRepo();
    const opts: StageOptions = {
      client: makeClient([]),
      repository: repo,
      logger: noopLogger,
      topicContext,
    };

    const result = await runRankStage([], opts);

    expect(result.scored).toHaveLength(0);
    expect(result.pipelineRun.stage).toBe('rank');
    expect(result.pipelineRun.status).toBe('ok');
    expect(repo.logPipelineRun).toHaveBeenCalledOnce();
  });

  it('scores candidates and persists updates', async () => {
    const articles = [makeArticle('art-1', 'Article 1'), makeArticle('art-2', 'Article 2')];
    const client = makeClient([
      { id: 'art-1', importanceScore: 0.9, relevanceScore: 0.8 },
      { id: 'art-2', importanceScore: 0.5, relevanceScore: 0.6 },
    ]);
    const repo = makeRepo();
    const opts: StageOptions = { client, repository: repo, logger: noopLogger, topicContext };

    const result = await runRankStage(articles, opts);

    expect(result.scored).toHaveLength(2);
    // Sorted by combined score desc: art-1 (1.7) > art-2 (1.1)
    expect(result.scored[0]?.candidateId).toBe('art-1');
    expect(result.scored[0]?.importanceScore).toBe(0.9);

    expect(repo.updateScores).toHaveBeenCalledWith([
      { id: 'art-1', importanceScore: 0.9, relevanceScore: 0.8 },
      { id: 'art-2', importanceScore: 0.5, relevanceScore: 0.6 },
    ]);
  });

  it('logs pipeline run with model and token counts', async () => {
    const articles = [makeArticle('art-1', 'Article 1')];
    const client = makeClient([{ id: 'art-1', importanceScore: 0.7, relevanceScore: 0.5 }]);
    const repo = makeRepo();
    const opts: StageOptions = { client, repository: repo, logger: noopLogger, topicContext };

    const result = await runRankStage(articles, opts);

    expect(result.pipelineRun.model).toBe('claude-sonnet-4-6');
    expect(result.pipelineRun.tokensIn).toBe(200);
    expect(result.pipelineRun.tokensOut).toBe(100);
    expect(result.pipelineRun.costUsd).toBeGreaterThan(0);
  });

  it('logs error run and rethrows when LLM fails', async () => {
    const articles = [makeArticle('art-1', 'Article 1')];
    const client: AnthropicClient = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error('LLM failure')),
      },
    } as unknown as AnthropicClient;
    const repo = makeRepo();
    const opts: StageOptions = { client, repository: repo, logger: noopLogger, topicContext };

    await expect(runRankStage(articles, opts)).rejects.toThrow('LLM failure');
    expect(repo.logPipelineRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error' }),
    );
  });
});

describe('buildSystemPrompt (rank)', () => {
  it('preserves the original hardcoded relevance copy when audience is null', () => {
    const prompt = buildSystemPrompt(topicContext);
    // Original verbatim audience text — guards byte-identity for enterprise-ai.
    expect(prompt).toContain(
      "relevanceScore (0.0–1.0): Relevance to Mega Bilgisayar's Turkish customer/prospect audience.",
    );
    expect(prompt).toContain(
      'These are Turkish IT professionals, CIOs, and business decision-makers at mid-to-large companies.',
    );
    expect(prompt).toContain('Low relevance: consumer apps, highly academic papers');
  });

  it('injects a custom audience when provided', () => {
    const prompt = buildSystemPrompt({ ...topicContext, audience: 'FinTech CTOs' });
    expect(prompt).toContain('Relevance to FinTech CTOs');
    expect(prompt).not.toContain("Mega Bilgisayar's Turkish customer/prospect audience");
  });
});
