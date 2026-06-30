// ---------------------------------------------------------------------------
// Stage 5 — RENDER
// No LLM involved. Assembles IssueItems, calls the injected renderFn to
// produce bodyHtml, then upserts the Issue(draft) + its IssueItems.
// Idempotent on isoWeek.
//
// The renderFn is injected (not imported directly) so @digest/email
// does not need to be a compile-time dependency of this module — allowing
// consumers (apps/worker) to wire up the real renderer, while tests can
// pass a lightweight stub.
// ---------------------------------------------------------------------------

import type { CopywriteOutput, RenderOutput, StageOptions, PipelineRunRecord, QaFlag } from './types';
import { calcCostUsd } from './config';

// ---------------------------------------------------------------------------
// Injected render function type — matches renderDigestEmail from @digest/email
// ---------------------------------------------------------------------------

export interface DigestItem {
  readonly titleTr: string;
  readonly summaryTr: string;
  readonly sourceUrl: string;
  readonly sourceName: string;
}

export interface DigestEmailData {
  readonly subject: string;
  readonly preheader: string;
  readonly issueDate: string;
  readonly issueLabel: string;
  readonly items: readonly [DigestItem, DigestItem] | readonly [DigestItem, DigestItem, DigestItem];
  readonly unsubscribeUrl: string;
  readonly senderAddress: string;
}

export interface RenderedEmail {
  readonly html: string;
  readonly text: string;
}

/** Injectable render function — pass renderDigestEmail from @digest/email in production. */
export type RenderFn = (data: DigestEmailData) => Promise<RenderedEmail>;

// ---------------------------------------------------------------------------
// Stage implementation
// ---------------------------------------------------------------------------

export interface RenderStageInput {
  readonly isoWeek: string;
  readonly copywrite: CopywriteOutput;
  readonly qaFlags: readonly QaFlag[];
  readonly factCheckNotes: readonly string[];
  /** The render function to call (injected). */
  readonly renderFn: RenderFn;
}

export interface RenderStageResult {
  readonly render: RenderOutput;
  readonly pipelineRun: PipelineRunRecord;
}

/**
 * Stage 5 — RENDER
 *
 * Builds issue items, renders branded HTML via the injected renderFn,
 * and upserts the Issue row + IssueItem rows.
 * Re-running for the same isoWeek updates the existing draft (idempotent).
 */
export async function runRenderStage(
  input: RenderStageInput,
  opts: StageOptions,
): Promise<RenderStageResult> {
  const { repository, logger, issueId: providedIssueId, topicContext } = opts;
  const { isoWeek, copywrite, qaFlags, factCheckNotes, renderFn } = input;
  const model = 'none';
  const startedAt = new Date();

  logger.info('pipeline.render.start', { isoWeek });

  try {
    // 1. Upsert the Issue row (creates if not exists, updates subject/preheader).
    const issueId = await repository.upsertIssue({
      topicId: topicContext.topicId,
      isoWeek,
      subject: copywrite.subject,
      preheader: copywrite.preheader,
      status: 'draft',
    });

    // 2. Build DigestItem array for the email template.
    const digestItems: DigestItem[] = copywrite.items.map((item) => ({
      titleTr: item.titleTr,
      summaryTr: item.summaryTr,
      sourceUrl: item.sourceUrl,
      sourceName: item.sourceName,
    }));

    // Type guard: template requires exactly 2 or 3 items.
    if (digestItems.length < 2 || digestItems.length > 3) {
      throw new Error(
        `Render stage expects 2 or 3 digest items, got ${digestItems.length}`,
      );
    }

    const items = digestItems as
      | [DigestItem, DigestItem]
      | [DigestItem, DigestItem, DigestItem];

    // 3. Render branded HTML + text via the injected renderFn.
    const rendered = await renderFn({
      subject: copywrite.subject,
      preheader: copywrite.preheader,
      issueDate: new Date().toISOString().slice(0, 10),
      issueLabel: isoWeek,
      items,
      unsubscribeUrl: '{{unsubscribeUrl}}',
      senderAddress: 'Mega Bilgisayar Tic. Ltd. Şti, Ankara, Türkiye',
    });

    // 4. Build structured bodyJson for the dashboard editor.
    const bodyJson = {
      isoWeek,
      subject: copywrite.subject,
      preheader: copywrite.preheader,
      items: copywrite.items.map((item, i) => ({
        order: i,
        candidateId: item.candidateId,
        titleTr: item.titleTr,
        summaryTr: item.summaryTr,
        sourceUrl: item.sourceUrl,
        sourceName: item.sourceName,
      })),
    };

    // 5. Persist bodyHtml + bodyJson on the issue.
    await repository.updateIssueBody(issueId, rendered.html, bodyJson);

    // 6. Upsert IssueItem rows (idempotent by issueId+order).
    const issueItems = copywrite.items.map((item, i) => ({
      candidateArticleId: item.candidateId || undefined,
      order: i,
      titleTr: item.titleTr,
      summaryTr: item.summaryTr,
      sourceUrl: item.sourceUrl,
      sourceName: item.sourceName,
      factCheckNotes: factCheckNotes[i] ?? undefined,
      qaFlags:
        qaFlags.filter((f) => f.itemIndex === i).length > 0
          ? qaFlags.filter((f) => f.itemIndex === i)
          : undefined,
    }));

    await repository.upsertIssueItems(issueId, issueItems);

    const finishedAt = new Date();
    const run: PipelineRunRecord = {
      stage: 'render',
      model,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: calcCostUsd(model, 0, 0),
      status: 'ok',
      error: undefined,
      startedAt,
      finishedAt,
    };

    await repository.logPipelineRun({ ...run, topicId: topicContext.topicId, issueId });

    logger.info('pipeline.render.done', { issueId, isoWeek });

    return {
      render: {
        issueId,
        isoWeek,
        bodyHtml: rendered.html,
        bodyJson,
      },
      pipelineRun: run,
    };
  } catch (err: unknown) {
    const finishedAt = new Date();
    const run: PipelineRunRecord = {
      stage: 'render',
      model,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
      startedAt,
      finishedAt,
    };
    await repository.logPipelineRun({
      ...run,
      topicId: topicContext.topicId,
      issueId: providedIssueId,
    });
    throw err;
  }
}
