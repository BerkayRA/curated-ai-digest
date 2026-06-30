import { describe, it, expect, vi } from 'vitest';
import { runEditorQaStage, buildSystemPrompt } from '../pipeline/stage4-editor-qa';
import type {
  StageOptions,
  PipelineRepository,
  ScoredCandidate,
  CopywriteOutput,
  PipelineRunRecord,
  TopicContext,
} from '../pipeline/types';
import type { Logger } from '../ingest/types';
import type { AnthropicClient } from '../pipeline/types';

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

function makeRepo(): PipelineRepository {
  return {
    findCandidates: vi.fn().mockResolvedValue([]),
    updateScores: vi.fn().mockResolvedValue(undefined),
    selectCandidates: vi.fn().mockResolvedValue(undefined),
    upsertIssue: vi.fn().mockResolvedValue('issue-1'),
    upsertIssueItems: vi.fn().mockResolvedValue(undefined),
    updateIssueBody: vi.fn().mockResolvedValue(undefined),
    logPipelineRun: vi.fn().mockResolvedValue('run-1'),
    findIssueByWeek: vi.fn().mockResolvedValue(null),
  };
}

function makeCandidate(id: string): ScoredCandidate {
  return {
    candidateId: id,
    title: `Article ${id}`,
    sourceUrl: `https://example.com/${id}`,
    sourceName: 'Test Source',
    rawExcerpt: 'Source excerpt.',
    importanceScore: 0.8,
    relevanceScore: 0.7,
  };
}

const baseCopywrite: CopywriteOutput = {
  items: [
    {
      candidateId: 'a1',
      titleTr: 'Başlık Bir',
      summaryTr: 'Yapay zeka alanında önemli bir gelişme yaşandı. Bu gelişme sektörü etkileyecek.',
      sourceUrl: 'https://example.com/a1',
      sourceName: 'Test Source',
    },
    {
      candidateId: 'a2',
      titleTr: 'Başlık İki',
      summaryTr:
        'İkinci önemli gelişme hakkında bilgiler sunulmaktadır. Kurumsal kullanıcılar için değerlidir.',
      sourceUrl: 'https://example.com/a2',
      sourceName: 'Test Source',
    },
  ],
  subject: 'Bu Hafta YZ Haberleri',
  preheader: 'Önemli gelişmeler ve daha fazlası.',
};

function makePassingQaResponse() {
  return {
    content: [
      {
        type: 'tool_use' as const,
        id: 'tu_1',
        name: 'qa_review',
        input: {
          passed: true,
          flags: [],
          factCheckNotes: ['All facts verified.'],
          feedbackForCopywrite: undefined,
        },
      },
    ],
    usage: { input_tokens: 250, output_tokens: 80 },
  };
}

function makeFailingQaResponse(feedback: string) {
  return {
    content: [
      {
        type: 'tool_use' as const,
        id: 'tu_1',
        name: 'qa_review',
        input: {
          passed: false,
          flags: [
            { itemIndex: 0, field: 'factual', issue: 'Claim not in source', severity: 'block' },
          ],
          factCheckNotes: ['Item 0: claim unsupported.'],
          feedbackForCopywrite: feedback,
        },
      },
    ],
    usage: { input_tokens: 300, output_tokens: 100 },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runEditorQaStage', () => {
  it('returns passed=true immediately when QA passes on first attempt', async () => {
    const client: AnthropicClient = {
      messages: {
        create: vi.fn().mockResolvedValue(makePassingQaResponse()),
      },
    } as unknown as AnthropicClient;
    const repo = makeRepo();
    const opts: StageOptions = { client, repository: repo, logger: noopLogger, topicContext };
    const copywriteFn = vi.fn();

    const result = await runEditorQaStage(
      [makeCandidate('a1'), makeCandidate('a2')],
      baseCopywrite,
      opts,
      2,
      copywriteFn,
    );

    expect(result.qaOutput.passed).toBe(true);
    expect(result.allFlags).toHaveLength(0);
    expect(copywriteFn).not.toHaveBeenCalled();
    expect(result.pipelineRuns).toHaveLength(1);
  });

  it('retries copywrite when QA fails, then passes on second QA', async () => {
    const client: AnthropicClient = {
      messages: {
        create: vi
          .fn()
          // First QA call: fail
          .mockResolvedValueOnce(makeFailingQaResponse('Fix the unsupported claim'))
          // Second QA call (after retry): pass
          .mockResolvedValueOnce(makePassingQaResponse()),
      },
    } as unknown as AnthropicClient;

    const repo = makeRepo();
    const opts: StageOptions = { client, repository: repo, logger: noopLogger, topicContext };

    const revisedCopywrite: CopywriteOutput = { ...baseCopywrite };
    const copywriteRun: PipelineRunRecord = {
      stage: 'copywrite',
      model: 'claude-opus-4-8',
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.005,
      status: 'ok',
      error: undefined,
      startedAt: new Date(),
      finishedAt: new Date(),
    };
    const copywriteFn = vi.fn().mockResolvedValue({
      output: revisedCopywrite,
      pipelineRun: copywriteRun,
    });

    const result = await runEditorQaStage(
      [makeCandidate('a1'), makeCandidate('a2')],
      baseCopywrite,
      opts,
      2,
      copywriteFn,
    );

    expect(copywriteFn).toHaveBeenCalledOnce();
    expect(copywriteFn).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Object),
      'Fix the unsupported claim',
    );
    expect(result.qaOutput.passed).toBe(true);
    // pipelineRuns: first QA + copywrite retry + second QA = 3
    expect(result.pipelineRuns).toHaveLength(3);
    // Flags from the first (failing) QA pass are accumulated
    expect(result.allFlags).toHaveLength(1);
  });

  it('stops at maxRetries even if QA keeps failing', async () => {
    const client: AnthropicClient = {
      messages: {
        create: vi.fn().mockResolvedValue(makeFailingQaResponse('Always fail')),
      },
    } as unknown as AnthropicClient;
    const repo = makeRepo();
    const opts: StageOptions = { client, repository: repo, logger: noopLogger, topicContext };

    const copywriteRun: PipelineRunRecord = {
      stage: 'copywrite',
      model: 'claude-opus-4-8',
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0,
      status: 'ok',
      error: undefined,
      startedAt: new Date(),
      finishedAt: new Date(),
    };
    const copywriteFn = vi.fn().mockResolvedValue({
      output: baseCopywrite,
      pipelineRun: copywriteRun,
    });

    const result = await runEditorQaStage(
      [makeCandidate('a1'), makeCandidate('a2')],
      baseCopywrite,
      opts,
      1, // maxRetries=1 → max 2 QA passes total
      copywriteFn,
    );

    // maxRetries=1 → 2 QA calls, 1 copywrite retry
    expect(copywriteFn).toHaveBeenCalledTimes(1);
    // Final result is whatever the last QA returned (failed)
    expect(result.qaOutput.passed).toBe(false);
    // All flags from both QA passes accumulated
    expect(result.allFlags).toHaveLength(2);
  });
});

describe('buildSystemPrompt (editor/qa)', () => {
  it('preserves the original brand-voice descriptor when voice is null', () => {
    const prompt = buildSystemPrompt(topicContext);
    expect(prompt).toContain('matches the brand voice (confident, clear, no hype).');
    expect(prompt).toContain('FACT-CHECK: Verify every specific claim, number, date, or statistic');
  });

  it('injects a custom voice descriptor when provided', () => {
    const prompt = buildSystemPrompt({ ...topicContext, voice: 'playful, bold' });
    expect(prompt).toContain('matches the brand voice (playful, bold).');
    expect(prompt).not.toContain('matches the brand voice (confident, clear, no hype).');
  });

  it('uses the Turkish hype-word list when language is undefined (regression)', () => {
    const prompt = buildSystemPrompt(topicContext);
    expect(prompt).toContain('"devrimci", "çığır açan", "inanılmaz", "benzersiz"');
    expect(prompt).toContain("Mega Bilgisayar's Turkish AI newsletter");
  });

  it('uses an English hype-word list for EN topics', () => {
    const prompt = buildSystemPrompt({ ...topicContext, language: 'en' });
    expect(prompt).toContain(
      '"revolutionary", "game-changing", "unbelievable", "unparalleled", "groundbreaking"',
    );
    expect(prompt).toContain("Mega Bilgisayar's English AI newsletter");
    expect(prompt).not.toContain('devrimci');
    expect(prompt).not.toContain('çığır açan');
  });
});
