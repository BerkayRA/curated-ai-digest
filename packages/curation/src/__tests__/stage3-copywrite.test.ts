import { describe, it, expect, vi } from 'vitest';
import { runCopywriteStage } from '../pipeline/stage3-copywrite.js';
import type { StageOptions, PipelineRepository, ScoredCandidate } from '../pipeline/types.js';
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
    rawExcerpt: 'English excerpt here.',
    importanceScore: 0.8,
    relevanceScore: 0.7,
  };
}

const validCopyOutput = {
  items: [
    {
      candidateId: 'a1',
      titleTr: 'Türkçe Başlık Bir',
      summaryTr: 'Bu haber, yapay zeka alanında önemli bir gelişmeyi ele almaktadır. Mega Bilişim okuyucuları için kritik bilgiler içermektedir.',
      sourceUrl: 'https://example.com/a1',
      sourceName: 'Test Source',
    },
    {
      candidateId: 'a2',
      titleTr: 'Türkçe Başlık İki',
      summaryTr: 'İkinci haber de yapay zeka sektöründe önemli gelişmeleri aktarmaktadır. Kurumsal kullanıcılar için değerli bilgiler sunmaktadır.',
      sourceUrl: 'https://example.com/a2',
      sourceName: 'Test Source',
    },
  ],
  subject: 'Bu Hafta YZ Dünyasında: Önemli Gelişmeler',
  preheader: 'OpenAI ve Anthropic\'ten büyük haberler, kurumsal yapay zeka araçları ve daha fazlası.',
};

function makeClient(output: unknown): AnthropicClient {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'tool_use',
            id: 'tu_1',
            name: 'write_copy',
            input: output,
          },
        ],
        usage: { input_tokens: 400, output_tokens: 200 },
      }),
    },
  } as unknown as AnthropicClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runCopywriteStage', () => {
  it('returns Turkish copy with subject and preheader', async () => {
    const candidates = [makeCandidate('a1'), makeCandidate('a2')];
    const client = makeClient(validCopyOutput);
    const repo = makeRepo();
    const opts: StageOptions = { client, repository: repo, logger: noopLogger };

    const result = await runCopywriteStage(candidates, opts);

    expect(result.output.items).toHaveLength(2);
    expect(result.output.subject).toBe('Bu Hafta YZ Dünyasında: Önemli Gelişmeler');
    expect(result.output.preheader).toContain('OpenAI');
  });

  it('logs pipeline run with copywrite stage', async () => {
    const candidates = [makeCandidate('a1'), makeCandidate('a2')];
    const client = makeClient(validCopyOutput);
    const repo = makeRepo();
    const opts: StageOptions = { client, repository: repo, logger: noopLogger };

    const result = await runCopywriteStage(candidates, opts);

    expect(result.pipelineRun.stage).toBe('copywrite');
    expect(result.pipelineRun.model).toBe('claude-opus-4-8');
    expect(result.pipelineRun.tokensIn).toBe(400);
    expect(result.pipelineRun.tokensOut).toBe(200);
    expect(result.pipelineRun.costUsd).toBeGreaterThan(0);
  });

  it('passes qaFeedback in retry call', async () => {
    const candidates = [makeCandidate('a1'), makeCandidate('a2')];
    const client = makeClient(validCopyOutput);
    const repo = makeRepo();
    const opts: StageOptions = { client, repository: repo, logger: noopLogger };
    const feedback = 'Fix hype words and verify claim about 40% improvement';

    await runCopywriteStage(candidates, opts, feedback);

    const createCall = (client.messages.create as ReturnType<typeof vi.fn>).mock.calls[0];
    // The feedback should appear in the user message
    expect(JSON.stringify(createCall)).toContain('Fix hype words');
  });

  it('logs error run and rethrows on LLM failure', async () => {
    const candidates = [makeCandidate('a1'), makeCandidate('a2')];
    const client: AnthropicClient = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error('API error')),
      },
    } as unknown as AnthropicClient;
    const repo = makeRepo();
    const opts: StageOptions = { client, repository: repo, logger: noopLogger };

    await expect(runCopywriteStage(candidates, opts)).rejects.toThrow('API error');
    expect(repo.logPipelineRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error' }),
    );
  });
});
