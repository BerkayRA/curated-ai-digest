// ---------------------------------------------------------------------------
// Prisma-backed PipelineRepository implementation
// ---------------------------------------------------------------------------

import { prisma } from '@mega-bulten/db';
import type { PipelineRepository, PipelineRunRecord } from './types.js';
import type { CandidateArticle } from '@mega-bulten/db';

/**
 * Returns a PipelineRepository backed by the singleton PrismaClient.
 * Importing and calling at module level is safe — DB I/O only happens when methods are invoked.
 */
export function createPipelinePrismaRepository(): PipelineRepository {
  return {
    async findCandidates(opts: {
      isoWeek: string;
      limit?: number;
    }): Promise<readonly CandidateArticle[]> {
      return prisma.candidateArticle.findMany({
        where: { status: 'candidate' },
        orderBy: { fetchedAt: 'desc' },
        take: opts.limit ?? 30,
      });
    },

    async updateScores(
      updates: readonly { id: string; importanceScore: number; relevanceScore: number }[],
    ): Promise<void> {
      await Promise.all(
        updates.map((u) =>
          prisma.candidateArticle.update({
            where: { id: u.id },
            data: {
              importanceScore: u.importanceScore,
              relevanceScore: u.relevanceScore,
            },
          }),
        ),
      );
    },

    async selectCandidates(ids: readonly string[]): Promise<void> {
      await prisma.candidateArticle.updateMany({
        where: { id: { in: [...ids] } },
        data: { status: 'selected' },
      });
    },

    async upsertIssue(opts: {
      isoWeek: string;
      subject: string;
      preheader: string;
      status: 'draft';
    }): Promise<string> {
      const issue = await prisma.issue.upsert({
        where: { isoWeek: opts.isoWeek },
        create: {
          isoWeek: opts.isoWeek,
          subject: opts.subject,
          preheader: opts.preheader,
          status: opts.status,
        },
        update: {
          subject: opts.subject,
          preheader: opts.preheader,
        },
        select: { id: true },
      });
      return issue.id;
    },

    async upsertIssueItems(
      issueId: string,
      items: readonly {
        candidateArticleId: string | undefined;
        order: number;
        titleTr: string;
        summaryTr: string;
        sourceUrl: string;
        sourceName: string;
        factCheckNotes: string | undefined;
        qaFlags: unknown;
      }[],
    ): Promise<void> {
      await Promise.all(
        items.map((item) =>
          prisma.issueItem.upsert({
            where: { issueId_order: { issueId, order: item.order } },
            create: {
              issueId,
              candidateArticleId: item.candidateArticleId,
              order: item.order,
              titleTr: item.titleTr,
              summaryTr: item.summaryTr,
              sourceUrl: item.sourceUrl,
              sourceName: item.sourceName,
              factCheckNotes: item.factCheckNotes,
              qaFlags: item.qaFlags !== undefined ? (item.qaFlags as object) : undefined,
            },
            update: {
              candidateArticleId: item.candidateArticleId,
              titleTr: item.titleTr,
              summaryTr: item.summaryTr,
              sourceUrl: item.sourceUrl,
              sourceName: item.sourceName,
              factCheckNotes: item.factCheckNotes,
              qaFlags: item.qaFlags !== undefined ? (item.qaFlags as object) : undefined,
            },
          }),
        ),
      );
    },

    async updateIssueBody(issueId: string, bodyHtml: string, bodyJson: unknown): Promise<void> {
      await prisma.issue.update({
        where: { id: issueId },
        data: {
          bodyHtml,
          bodyJson: bodyJson as object,
        },
      });
    },

    async logPipelineRun(
      opts: Omit<PipelineRunRecord, 'startedAt' | 'finishedAt'> & {
        issueId?: string;
        startedAt: Date;
        finishedAt: Date;
      },
    ): Promise<string> {
      const row = await prisma.pipelineRun.create({
        data: {
          issueId: opts.issueId,
          stage: opts.stage,
          model: opts.model,
          tokensIn: opts.tokensIn,
          tokensOut: opts.tokensOut,
          costUsd: opts.costUsd,
          status: opts.status,
          error: opts.error,
          startedAt: opts.startedAt,
          finishedAt: opts.finishedAt,
        },
        select: { id: true },
      });
      return row.id;
    },

    async findIssueByWeek(isoWeek: string): Promise<{ id: string; status: string } | null> {
      const issue = await prisma.issue.findUnique({
        where: { isoWeek },
        select: { id: true, status: true },
      });
      return issue ? { id: issue.id, status: issue.status } : null;
    },
  };
}
