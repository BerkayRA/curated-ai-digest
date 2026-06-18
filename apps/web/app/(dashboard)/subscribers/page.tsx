import { prisma } from '@digest/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubscribersClient } from '@/components/subscribers/SubscribersClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Aboneler — Curated AI Digest',
};

export default async function SubscribersPage() {
  const subscribers = await prisma.subscriber.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return (
    <section aria-label="Aboneler">
      <PageHeader title="Aboneler" description="Digest alıcılarını yönetin" />
      <SubscribersClient initialSubscribers={subscribers} />
    </section>
  );
}
