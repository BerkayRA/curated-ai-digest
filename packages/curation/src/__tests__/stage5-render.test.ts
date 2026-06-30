import { describe, it, expect, vi } from 'vitest';
import { runRenderStage } from '../pipeline/stage5-render';
import type {
  StageOptions,
  PipelineRepository,
  CopywriteOutput,
  TopicContext,
} from '../pipeline/types';
import type { Logger } from '../ingest/types';
import type { RenderFn } from '../pipeline/stage5-render';

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
    upsertIssue: vi.fn().mockResolvedValue('issue-xyz'),
    upsertIssueItems: vi.fn().mockResolvedValue(undefined),
    updateIssueBody: vi.fn().mockResolvedValue(undefined),
    logPipelineRun: vi.fn().mockResolvedValue('run-1'),
    findIssueByWeek: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

const stubRenderFn: RenderFn = vi.fn().mockResolvedValue({
  html: '<html><body>Test</body></html>',
  text: 'Test',
});

const baseCopywrite: CopywriteOutput = {
  items: [
    {
      candidateId: 'c1',
      titleTr: 'Baslik Bir',
      summaryTr: 'Ozet bir. Uzun metin aciklama.',
      sourceUrl: 'https://example.com/c1',
      sourceName: 'Test Source',
    },
    {
      candidateId: 'c2',
      titleTr: 'Baslik Iki',
      summaryTr: 'Ozet iki. Uzun metin aciklama.',
      sourceUrl: 'https://example.com/c2',
      sourceName: 'Test Source',
    },
  ],
  subject: 'Test Konu',
  preheader: 'Test on metin',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runRenderStage', () => {
  it('upserts issue, calls renderFn, updates body, upserts items', async () => {
    const repo = makeRepo();
    const opts: StageOptions = { client: {} as StageOptions['client'], repository: repo, logger: noopLogger, topicContext };

    const result = await runRenderStage(
      {
        isoWeek: '2026-W24',
        copywrite: baseCopywrite,
        qaFlags: [],
        factCheckNotes: ['Note 1', 'Note 2'],
        renderFn: stubRenderFn,
      },
      opts,
    );

    expect(result.render.issueId).toBe('issue-xyz');
    expect(result.render.isoWeek).toBe('2026-W24');
    expect(result.render.bodyHtml).toBe('<html><body>Test</body></html>');

    expect(repo.upsertIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        topicId: 'topic_enterprise_ai',
        isoWeek: '2026-W24',
        subject: 'Test Konu',
        status: 'draft',
      }),
    );
    expect(repo.updateIssueBody).toHaveBeenCalledWith('issue-xyz', '<html><body>Test</body></html>', expect.any(Object));
    expect(repo.upsertIssueItems).toHaveBeenCalledWith(
      'issue-xyz',
      expect.arrayContaining([
        expect.objectContaining({ order: 0, titleTr: 'Baslik Bir', factCheckNotes: 'Note 1' }),
        expect.objectContaining({ order: 1, titleTr: 'Baslik Iki', factCheckNotes: 'Note 2' }),
      ]),
    );
  });

  it('passes isoWeek and items to renderFn', async () => {
    const renderFn: RenderFn = vi.fn().mockResolvedValue({ html: '<html>', text: '' });
    const repo = makeRepo();
    const opts: StageOptions = { client: {} as StageOptions['client'], repository: repo, logger: noopLogger, topicContext };

    await runRenderStage(
      { isoWeek: '2026-W24', copywrite: baseCopywrite, qaFlags: [], factCheckNotes: [], renderFn },
      opts,
    );

    expect(renderFn).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Test Konu',
        issueLabel: '2026-W24',
        items: expect.arrayContaining([
          expect.objectContaining({ titleTr: 'Baslik Bir' }),
        ]),
      }),
    );
  });

  it('logs pipeline run with render stage', async () => {
    const repo = makeRepo();
    const opts: StageOptions = { client: {} as StageOptions['client'], repository: repo, logger: noopLogger, topicContext };

    const result = await runRenderStage(
      { isoWeek: '2026-W24', copywrite: baseCopywrite, qaFlags: [], factCheckNotes: [], renderFn: stubRenderFn },
      opts,
    );

    expect(result.pipelineRun.stage).toBe('render');
    expect(result.pipelineRun.model).toBe('none');
    expect(result.pipelineRun.status).toBe('ok');
    expect(repo.logPipelineRun).toHaveBeenCalledOnce();
  });

  it('logs error run and rethrows when renderFn throws', async () => {
    const renderFn: RenderFn = vi.fn().mockRejectedValue(new Error('Render failed'));
    const repo = makeRepo();
    const opts: StageOptions = { client: {} as StageOptions['client'], repository: repo, logger: noopLogger, topicContext };

    await expect(
      runRenderStage(
        { isoWeek: '2026-W24', copywrite: baseCopywrite, qaFlags: [], factCheckNotes: [], renderFn },
        opts,
      ),
    ).rejects.toThrow('Render failed');
    expect(repo.logPipelineRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error' }),
    );
  });

  it('throws for items count outside 2-3 range', async () => {
    const badCopywrite: CopywriteOutput = {
      items: [baseCopywrite.items[0]!],
      subject: 'x',
      preheader: 'y',
    };
    const renderFn: RenderFn = vi.fn().mockResolvedValue({ html: '', text: '' });
    const repo = makeRepo();
    const opts: StageOptions = { client: {} as StageOptions['client'], repository: repo, logger: noopLogger, topicContext };

    await expect(
      runRenderStage(
        { isoWeek: '2026-W24', copywrite: badCopywrite, qaFlags: [], factCheckNotes: [], renderFn },
        opts,
      ),
    ).rejects.toThrow('expects 2 or 3 digest items');
  });
});
