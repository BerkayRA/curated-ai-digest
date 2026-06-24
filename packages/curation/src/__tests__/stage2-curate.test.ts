import { describe, it, expect, vi } from 'vitest';
import { runCurateStage, buildSystemPrompt } from '../pipeline/stage2-curate.js';
import type {
  StageOptions,
  PipelineRepository,
  ScoredCandidate,
  TopicContext,
} from '../pipeline/types.js';
import type { Logger } from '../ingest/types.js';
import type { AnthropicClient } from '../pipeline/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const noopLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

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

function makeCandidate(id: string, importance = 0.7, relevance = 0.8): ScoredCandidate {
  return {
    candidateId: id,
    title: `Article ${id}`,
    sourceUrl: `https://example.com/${id}`,
    sourceName: 'Test Source',
    rawExcerpt: 'Excerpt',
    importanceScore: importance,
    relevanceScore: relevance,
  };
}

function makeClient(selectedIds: string[]): AnthropicClient {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'tool_use',
            id: 'tu_1',
            name: 'select_articles',
            input: { selectedIds, justification: 'Good selection' },
          },
        ],
        usage: { input_tokens: 300, output_tokens: 80 },
      }),
    },
  } as unknown as AnthropicClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runCurateStage', () => {
  it('selects exactly 2 articles', async () => {
    const candidates = [
      makeCandidate('a1'),
      makeCandidate('a2'),
      makeCandidate('a3'),
      makeCandidate('a4'),
    ];
    const client = makeClient(['a1', 'a2']);
    const repo = makeRepo();
    const opts: StageOptions = { client, repository: repo, logger: noopLogger, topicContext };

    const result = await runCurateStage(candidates, opts);

    expect(result.selection.selectedIds).toHaveLength(2);
    expect(result.selectedCandidates).toHaveLength(2);
    expect(repo.selectCandidates).toHaveBeenCalledWith(['a1', 'a2']);
  });

  it('selects exactly 3 articles', async () => {
    const candidates = [
      makeCandidate('a1'),
      makeCandidate('a2'),
      makeCandidate('a3'),
      makeCandidate('a4'),
    ];
    const client = makeClient(['a1', 'a2', 'a3']);
    const repo = makeRepo();
    const opts: StageOptions = { client, repository: repo, logger: noopLogger, topicContext };

    const result = await runCurateStage(candidates, opts);

    expect(result.selection.selectedIds).toHaveLength(3);
    expect(result.selectedCandidates).toHaveLength(3);
  });

  it('throws when fewer than 2 candidates provided', async () => {
    const client = makeClient([]);
    const repo = makeRepo();
    const opts: StageOptions = { client, repository: repo, logger: noopLogger, topicContext };

    await expect(runCurateStage([makeCandidate('a1')], opts)).rejects.toThrow(
      'Not enough candidates',
    );
    expect(repo.logPipelineRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error' }),
    );
  });

  it('logs pipeline run with correct stage', async () => {
    const candidates = [makeCandidate('a1'), makeCandidate('a2'), makeCandidate('a3')];
    const client = makeClient(['a1', 'a2']);
    const repo = makeRepo();
    const opts: StageOptions = { client, repository: repo, logger: noopLogger, topicContext };

    const result = await runCurateStage(candidates, opts);

    expect(result.pipelineRun.stage).toBe('curate');
    expect(result.pipelineRun.model).toBe('claude-opus-4-8');
    expect(result.pipelineRun.status).toBe('ok');
  });

  it('throws when LLM returns invalid article ids', async () => {
    const candidates = [makeCandidate('a1'), makeCandidate('a2')];
    // Model returns IDs not in the candidate list
    const client = makeClient(['nonexistent-1', 'nonexistent-2']);
    const repo = makeRepo();
    const opts: StageOptions = { client, repository: repo, logger: noopLogger, topicContext };

    await expect(runCurateStage(candidates, opts)).rejects.toThrow('invalid article ids');
  });

  it('zod rejects if model selects only 1 article', async () => {
    const candidates = [makeCandidate('a1'), makeCandidate('a2'), makeCandidate('a3')];
    const client: AnthropicClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'tool_use',
              id: 'tu_1',
              name: 'select_articles',
              input: { selectedIds: ['a1'], justification: 'Only one' },
            },
          ],
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      },
    } as unknown as AnthropicClient;
    const repo = makeRepo();
    const opts: StageOptions = { client, repository: repo, logger: noopLogger, topicContext };

    // Should fail after retries because schema requires min 2
    await expect(runCurateStage(candidates, opts)).rejects.toThrow();
  });
});

describe('buildSystemPrompt (curate)', () => {
  it('preserves the original "Turkish IT professionals" audience when null', () => {
    const prompt = buildSystemPrompt(topicContext);
    expect(prompt).toContain(
      'Prioritise articles with high importance AND relevance to Turkish IT professionals.',
    );
  });

  it('injects a custom audience when provided', () => {
    const prompt = buildSystemPrompt({ ...topicContext, audience: 'FinTech CTOs' });
    expect(prompt).toContain('relevance to FinTech CTOs.');
    expect(prompt).not.toContain('relevance to Turkish IT professionals.');
  });
});
