import { Prisma, type PrismaClient, type SubjectVariant, type AbStatus } from '@prisma/client';

import { prisma as defaultClient } from './index';

// ---------------------------------------------------------------------------
// SubjectVariant access — authoring A/B subject variants on an issue and
// computing per-variant engagement (sent + opens) for winner selection.
// ---------------------------------------------------------------------------

export interface CreateSubjectVariantData {
  issueId: string;
  variantIndex: number;
  subject: string;
  testFraction?: number;
}

/** Per-variant tallies, computed from Send + EmailEvent for a single issue. */
export interface VariantStatsRow {
  variantIndex: number;
  sentCount: number;
  openCount: number;
}

export interface SubjectVariantRepository {
  /**
   * Variants are returned ascending by `variantIndex`. All variants for an
   * issue share a single `testFraction` (the dispatcher reads `variants[0]`).
   */
  findByIssueId(issueId: string): Promise<SubjectVariant[]>;
  create(data: CreateSubjectVariantData): Promise<SubjectVariant>;
  /** Replace all variants for an issue (used by the editor on save). */
  replaceForIssue(issueId: string, variants: CreateSubjectVariantData[]): Promise<void>;
  /**
   * Live per-variant sent + unique-open counts from Send/EmailEvent.
   * Returned ascending by `variantIndex`, mirroring findByIssueId.
   */
  getVariantStats(issueId: string): Promise<VariantStatsRow[]>;
  /**
   * Atomically claim an issue for winner selection: compare-and-swap its
   * abStatus from 'testing' → 'selecting' in a single UPDATE. Returns true when
   * THIS caller won the claim, false when another worker already took it (or the
   * issue was not in 'testing'). Prevents a TOCTOU double-send race.
   */
  claimAbTesting(issueId: string): Promise<boolean>;
  /** Persist computed sent/open counts onto the variant rows (for display). */
  persistCounts(issueId: string, stats: VariantStatsRow[]): Promise<void>;
  /** Transition an issue's A/B lifecycle status (+ optional winner index). */
  setIssueAbStatus(
    issueId: string,
    status: AbStatus,
    winnerVariantIndex?: number,
  ): Promise<void>;
}

export function createSubjectVariantRepository(
  client: PrismaClient = defaultClient,
): SubjectVariantRepository {
  return {
    findByIssueId(issueId: string): Promise<SubjectVariant[]> {
      return client.subjectVariant.findMany({
        where: { issueId },
        orderBy: { variantIndex: 'asc' },
      });
    },

    create(data: CreateSubjectVariantData): Promise<SubjectVariant> {
      return client.subjectVariant.create({
        data: {
          issueId: data.issueId,
          variantIndex: data.variantIndex,
          subject: data.subject,
          testFraction: data.testFraction ?? 0.5,
        },
      });
    },

    async replaceForIssue(
      issueId: string,
      variants: CreateSubjectVariantData[],
    ): Promise<void> {
      await client.$transaction([
        client.subjectVariant.deleteMany({ where: { issueId } }),
        ...variants.map((v) =>
          client.subjectVariant.create({
            data: {
              issueId,
              variantIndex: v.variantIndex,
              subject: v.subject,
              testFraction: v.testFraction ?? 0.5,
            },
          }),
        ),
      ]);
    },

    async getVariantStats(issueId: string): Promise<VariantStatsRow[]> {
      const rows = await client.$queryRaw<
        Array<{ variant_index: number; sent_count: number; open_count: number }>
      >(Prisma.sql`
        SELECT
          s.variant_index AS variant_index,
          COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'sent')::int AS sent_count,
          COUNT(DISTINCT ee.send_id) FILTER (WHERE ee.type = 'open')::int AS open_count
        FROM sends s
        LEFT JOIN email_events ee ON ee.send_id = s.id
        WHERE s.issue_id = ${issueId} AND s.variant_index IS NOT NULL
        GROUP BY s.variant_index
        ORDER BY s.variant_index ASC
      `);
      return rows.map((r) => ({
        variantIndex: r.variant_index,
        sentCount: r.sent_count,
        openCount: r.open_count,
      }));
    },

    async persistCounts(issueId: string, stats: VariantStatsRow[]): Promise<void> {
      await client.$transaction(
        stats.map((s) =>
          client.subjectVariant.updateMany({
            where: { issueId, variantIndex: s.variantIndex },
            data: { sentCount: s.sentCount, openCount: s.openCount },
          }),
        ),
      );
    },

    async claimAbTesting(issueId: string): Promise<boolean> {
      const r = await client.issue.updateMany({
        where: { id: issueId, abStatus: 'testing' },
        data: { abStatus: 'selecting' },
      });
      return r.count > 0;
    },

    async setIssueAbStatus(
      issueId: string,
      status: AbStatus,
      winnerVariantIndex?: number,
    ): Promise<void> {
      await client.issue.update({
        where: { id: issueId },
        data: {
          abStatus: status,
          ...(winnerVariantIndex !== undefined
            ? { abWinnerVariantIndex: winnerVariantIndex }
            : {}),
        },
      });
    },
  };
}
