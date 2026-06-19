import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock all stage modules before importing orchestrator
// ---------------------------------------------------------------------------

vi.mock('../pipeline/stage1-rank.js', () => ({
  runRankStage: vi.fn(),
}));

vi.mock('../pipeline/stage2-curate.js', () => ({
  runCurateStage: vi.fn(),
}));

vi.mock('../pipeline/stage3-copywrite.js', () => ({
  runCopywriteStage: vi.fn(),
}));

vi.mock('../pipeline/stage4-editor-qa.js', () => ({
  runEditorQaStage: vi.fn(),
}));

vi.mock('../pipeline/stage5-render.js', () => ({
  runRenderStage: vi.fn(),
}));

vi.mock('../ingest/orchestrator.js', () => ({
  runIngest: vi.fn().mockResolvedValue({ ingestRunId: 'ingest-1', persisted: 5 }),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { runRankStage } from '../pipeline/stage1-rank.js';
import { runCurateStage } from '../pipeline/stage2-curate.js';
import { runCopywriteStage } from '../pipeline/stage3-copywrite.js';
import { runEditorQaStage } from '../pipeline/stage4-editor-qa.js';
import { runRenderStage } from '../pipeline/stage5-render.js';
import { runWeeklyPipeline } from '../pipeline/orchestrator.js';
import type { PipelineRepository, PipelineRunRecord } from '../pipeline/types.js';
import type { Logger } from '../ingest/types.js';
import type { CandidateArticle } from '@digest/db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const noopLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function makeRun(stage: string): PipelineRunRecord {
  return {
    stage: stage as PipelineRunRecord['stage'],
    model: 'claude-opus-4-8',
    tokensIn: 100,
    tokensOut: 50,
    costUsd: 0.002,
    status: 'ok',
    error: undefined,
    startedAt: new Date(),
    finishedAt: new Date(),
  };
}

function makeArticle(id: string): CandidateArticle {
  return {
    id,
    sourceUrl: `https://example.com/${id}`,
    sourceName: 'Test',
    title: `Article ${id}`,
    rawExcerpt: null,
    publishedAt: null,
    contentHash: `hash-${id}`,
    importanceScore: null,
    relevanceScore: null,
    status: 'candidate',
    fetchedAt: new Date(),
    ingestRunId: null,
  };
}

function makeRepo(overrides: Partial<PipelineRepository> = {}): PipelineRepository {
  return {
    findCandidates: vi.fn().mockResolvedValue([
      makeArticle('c1'),
      makeArticle('c2'),
      makeArticle('c3'),
    ]),
    updateScores: vi.fn().mockResolvedValue(undefined),
    selectCandidates: vi.fn().mockResolvedValue(undefined),
    upsertIssue: vi.fn().mockResolvedValue('issue-abc'),
    upsertIssueItems: vi.fn().mockResolvedValue(undefined),
    updateIssueBody: vi.fn().mockResolvedValue(undefined),
    logPipelineRun: vi.fn().mockResolvedValue('run-1'),
    findIssueByWeek: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

const mockAnthropicClient = {
  messages: { create: vi.fn() },
} as unknown as import('@anthropic-ai/sdk').default;

// ---------------------------------------------------------------------------
// Default stage mock return values
// ---------------------------------------------------------------------------

const scoredCandidates = [
  { candidateId: 'c1', title: 'A1', sourceUrl: 'https://example.com/c1', sourceName: 'S', rawExcerpt: undefined, importanceScore: 0.9, relevanceScore: 0.8 },
  { candidateId: 'c2', title: 'A2', sourceUrl: 'https://example.com/c2', sourceName: 'S', rawExcerpt: undefined, importanceScore: 0.7, relevanceScore: 0.6 },
];

const curatedCandidates = scoredCandidates.slice(0, 2);

const copywriteOutput = {
  items: [
    { candidateId: 'c1', titleTr: 'Başlık 1', summaryTr: 'Özet bir. Uzun metin açıklama.', sourceUrl: 'https://example.com/c1', sourceName: 'S' },
    { candidateId: 'c2', titleTr: 'Başlık 2', summaryTr: 'Özet iki. Uzun metin açıklama.', sourceUrl: 'https://example.com/c2', sourceName: 'S' },
  ],
  subject: 'Test Konu',
  preheader: 'Test ön metin',
};

function setupDefaultMocks() {
  vi.mocked(runRankStage).mockResolvedValue({
    scored: scoredCandidates,
    pipelineRun: makeRun('rank'),
  });

  vi.mocked(runCurateStage).mockResolvedValue({
    selection: { selectedIds: ['c1', 'c2'], justification: 'Best two' },
    selectedCandidates: curatedCandidates,
    pipelineRun: makeRun('curate'),
  });

  vi.mocked(runCopywriteStage).mockResolvedValue({
    output: copywriteOutput,
    pipelineRun: makeRun('copywrite'),
  });

  vi.mocked(runEditorQaStage).mockResolvedValue({
    qaOutput: { passed: true, flags: [], factCheckNotes: ['OK'], feedbackForCopywrite: undefined },
    pipelineRuns: [makeRun('editor_qa')],
    finalCopywrite: copywriteOutput,
    allFlags: [],
  });

  vi.mocked(runRenderStage).mockResolvedValue({
    render: { issueId: 'issue-abc', isoWeek: '2026-W24', bodyHtml: '<html>', bodyJson: {} },
    pipelineRun: makeRun('render'),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runWeeklyPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
    process.env['ANTHROPIC_API_KEY'] = 'test-key';
  });

  it('runs all 5 stages and returns PipelineResult', async () => {
    const repo = makeRepo();
    const result = await runWeeklyPipeline({
      isoWeek: '2026-W24',
      runIngestFirst: false,
      repository: repo,
      anthropicClient: mockAnthropicClient,
      logger: noopLogger,
    });

    expect(result.issueId).toBe('issue-abc');
    expect(result.isoWeek).toBe('2026-W24');
    expect(result.itemCount).toBe(2);
    expect(result.qaFlags).toHaveLength(0);
    // pipelineRuns: rank + curate + copywrite + editor_qa + render = 5
    expect(result.pipelineRuns).toHaveLength(5);
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it('throws if ANTHROPIC_API_KEY is not set (no injected client)', async () => {
    delete process.env['ANTHROPIC_API_KEY'];
    const repo = makeRepo();

    await expect(
      runWeeklyPipeline({
        isoWeek: '2026-W24',
        runIngestFirst: false,
        repository: repo,
        logger: noopLogger,
        // no anthropicClient override → will check env var
      }),
    ).rejects.toThrow('ANTHROPIC_API_KEY');

    process.env['ANTHROPIC_API_KEY'] = 'test-key';
  });

  it('throws if issue is already in terminal status', async () => {
    const repo = makeRepo({
      findIssueByWeek: vi.fn().mockResolvedValue({ id: 'existing', status: 'sent' }),
    });

    await expect(
      runWeeklyPipeline({
        isoWeek: '2026-W24',
        runIngestFirst: false,
        repository: repo,
        anthropicClient: mockAnthropicClient,
        logger: noopLogger,
      }),
    ).rejects.toThrow("already in status 'sent'");
  });

  it('throws if no candidates found', async () => {
    const repo = makeRepo({
      findCandidates: vi.fn().mockResolvedValue([]),
    });

    await expect(
      runWeeklyPipeline({
        isoWeek: '2026-W24',
        runIngestFirst: false,
        repository: repo,
        anthropicClient: mockAnthropicClient,
        logger: noopLogger,
      }),
    ).rejects.toThrow('No candidate articles found');
  });

  it('wires stages in correct order', async () => {
    const callOrder: string[] = [];
    vi.mocked(runRankStage).mockImplementation(async () => {
      callOrder.push('rank');
      return { scored: scoredCandidates, pipelineRun: makeRun('rank') };
    });
    vi.mocked(runCurateStage).mockImplementation(async () => {
      callOrder.push('curate');
      return {
        selection: { selectedIds: ['c1', 'c2'], justification: 'ok' },
        selectedCandidates: curatedCandidates,
        pipelineRun: makeRun('curate'),
      };
    });
    vi.mocked(runCopywriteStage).mockImplementation(async () => {
      callOrder.push('copywrite');
      return { output: copywriteOutput, pipelineRun: makeRun('copywrite') };
    });
    vi.mocked(runEditorQaStage).mockImplementation(async () => {
      callOrder.push('editor_qa');
      return {
        qaOutput: { passed: true, flags: [], factCheckNotes: [], feedbackForCopywrite: undefined },
        pipelineRuns: [makeRun('editor_qa')],
        finalCopywrite: copywriteOutput,
        allFlags: [],
      };
    });
    vi.mocked(runRenderStage).mockImplementation(async () => {
      callOrder.push('render');
      return {
        render: { issueId: 'issue-abc', isoWeek: '2026-W24', bodyHtml: '<html>', bodyJson: {} },
        pipelineRun: makeRun('render'),
      };
    });

    const repo = makeRepo();
    await runWeeklyPipeline({
      isoWeek: '2026-W24',
      runIngestFirst: false,
      repository: repo,
      anthropicClient: mockAnthropicClient,
      logger: noopLogger,
    });

    expect(callOrder).toEqual(['rank', 'curate', 'copywrite', 'editor_qa', 'render']);
  });

  it('idempotent: re-running for same week in draft status proceeds normally', async () => {
    const repo = makeRepo({
      findIssueByWeek: vi.fn().mockResolvedValue({ id: 'existing-draft', status: 'draft' }),
    });

    const result = await runWeeklyPipeline({
      isoWeek: '2026-W24',
      runIngestFirst: false,
      repository: repo,
      anthropicClient: mockAnthropicClient,
      logger: noopLogger,
    });

    // Should complete normally (draft is not a terminal state)
    expect(result.issueId).toBe('issue-abc');
  });
});
