import { prisma } from '@mega-bulten/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubscribersClient } from '@/components/subscribers/SubscribersClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Aboneler — Mega Bülten',
};

export default async function SubscribersPage() {
  const subscribers = await prisma.subscriber.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return (
    <section aria-labelledby="subscribers-heading">
      <PageHeader
        title="Aboneler"
        description="Bülten alıcılarını yönetin"
      />
      <SubscribersClient initialSubscribers={subscribers} />
    </section>
  );
}
