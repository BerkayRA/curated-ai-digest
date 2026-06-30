/**
 * /issues/[id] — Issue detail page.
 * Server Component: loads issue + items + qaFlags/factCheckNotes.
 * Client components handle editing, preview, audit history.
 */

import { notFound } from 'next/navigation';
import { prisma } from '@digest/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { issueStatusLabel } from '@/components/ui/Badge';
import { StatusPill, issueStatusTone } from '@/components/ui/StatusPill';
import { IssueEditor } from '@/components/issue-editor/IssueEditor';
import { AuditPanel } from '@/components/issue-editor/AuditPanel';
import type { IssueStatus, AbStatusValue, IssueItemKind, ConsentMode } from '@digest/shared';
import styles from './issue-detail.module.css';

export const dynamic = 'force-dynamic';

interface IssueDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata(props: IssueDetailPageProps) {
  const params = await props.params;
  const issue = await prisma.issue.findUnique({
    where: { id: params.id },
    select: { subject: true, isoWeek: true },
  });

  if (!issue) return { title: 'Bulunamadı — Curated AI Digest' };

  return {
    title: `${issue.isoWeek}: ${issue.subject} — Curated AI Digest`,
  };
}

export default async function IssueDetailPage(props: IssueDetailPageProps) {
  const params = await props.params;
  const issue = await prisma.issue.findUnique({
    where: { id: params.id },
    include: {
      items: { orderBy: { order: 'asc' } },
      variants: { orderBy: { variantIndex: 'asc' } },
      topic: { select: { consentMode: true, tier: true } },
    },
  });

  if (!issue) {
    notFound();
  }

  const issueData = {
    id: issue.id,
    isoWeek: issue.isoWeek,
    status: issue.status as IssueStatus,
    subject: issue.subject,
    preheader: issue.preheader,
    abStatus: issue.abStatus as AbStatusValue,
    abWinnerVariantIndex: issue.abWinnerVariantIndex,
    variants: issue.variants.map((v) => ({
      variantIndex: v.variantIndex,
      subject: v.subject,
      sentCount: v.sentCount,
      openCount: v.openCount,
    })),
    items: issue.items.map((item) => ({
      id: item.id,
      order: item.order,
      titleTr: item.titleTr,
      summaryTr: item.summaryTr,
      sourceUrl: item.sourceUrl,
      sourceName: item.sourceName,
      kind: item.kind as IssueItemKind,
      sponsorId: item.sponsorId,
      factCheckNotes: item.factCheckNotes,
      qaFlags: item.qaFlags,
    })),
    topicConsentMode: issue.topic.consentMode as ConsentMode,
    topicTier: issue.topic.tier as 'free' | 'premium',
  };

  return (
    <section aria-label="Sayı düzenleme" className={styles.page}>
      <PageHeader
        title={issue.isoWeek}
        description={issue.subject}
        actions={
          <StatusPill
            tone={issueStatusTone(issue.status as IssueStatus)}
            label={issueStatusLabel(issue.status)}
          />
        }
      />

      <IssueEditor issue={issueData} />

      <div className={styles.auditWrapper}>
        <AuditPanel issueId={issue.id} />
      </div>
    </section>
  );
}
