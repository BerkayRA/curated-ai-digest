import Link from 'next/link';
import { prisma } from '@mega-bulten/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { IssueArchiveTable } from '@/components/issues/IssueArchiveTable';
import styles from './issues.module.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Arşiv — Mega Bülten',
};

export default async function IssuesPage() {
  const issues = await prisma.issue.findMany({
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
        description="Tüm bülten sayıları — en yeniden eskiye."
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
