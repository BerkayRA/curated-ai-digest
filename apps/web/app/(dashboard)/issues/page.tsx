import { prisma } from '@mega-bulten/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { IssueArchiveTable } from '@/components/issues/IssueArchiveTable';

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
    <section aria-labelledby="issues-heading">
      <PageHeader
        title="Arşiv"
        description="Tüm bülten sayıları"
      />
      <IssueArchiveTable issues={issues} />
    </section>
  );
}
