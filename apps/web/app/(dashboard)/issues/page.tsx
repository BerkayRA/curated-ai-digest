import Link from 'next/link';
import { prisma } from '@digest/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { IssueArchiveTable } from '@/components/issues/IssueArchiveTable';
import { resolveTopicIdBySlug } from '@/lib/resolve-topic';
import styles from './issues.module.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Arşiv — Curated AI Digest',
};

export default async function IssuesPage(
  props: {
    searchParams: Promise<{ topic?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const topicId = await resolveTopicIdBySlug(searchParams.topic);
  const issues = await prisma.issue.findMany({
    where: { topicId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      isoWeek: true,
      status: true,
      subject: true,
      preheader: true,
      scheduledAt: true,
      sentAt: true,
      autoSent: true,
      createdAt: true,
      _count: { select: { items: true } },
    },
  });

  return (
    <section aria-label="Sayı arşivi">
      <PageHeader
        title="Sayı arşivi"
        description="Tüm digest sayıları — en yeniden eskiye."
        actions={
          <Link href="/issues/new" className={styles.newLink}>
            + Yeni Sayı
          </Link>
        }
      />
      <IssueArchiveTable issues={issues} />
    </section>
  );
}
