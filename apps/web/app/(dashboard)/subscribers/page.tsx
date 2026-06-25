import { prisma, createTopicRepository } from '@digest/db';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubscribersClient } from '@/components/subscribers/SubscribersClient';
import { resolveTopicIdBySlug } from '@/lib/resolve-topic';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Aboneler — Curated AI Digest',
};

export default async function SubscribersPage({
  searchParams,
}: {
  searchParams: { topic?: string };
}) {
  const [subscribers, topics, activeTopicId] = await Promise.all([
    prisma.subscriber.findMany({ orderBy: { createdAt: 'desc' } }),
    createTopicRepository(prisma).findAll(),
    resolveTopicIdBySlug(searchParams.topic),
  ]);

  // Membership rows for all subscribers, mapped to { subscriberId: topicId[] }.
  const memberships = await prisma.subscriberTopic.findMany({
    where: { status: 'active' },
    select: { subscriberId: true, topicId: true },
  });

  const topicsBySubscriber: Record<string, string[]> = {};
  for (const m of memberships) {
    const list = topicsBySubscriber[m.subscriberId] ?? [];
    topicsBySubscriber[m.subscriberId] = [...list, m.topicId];
  }

  const topicOptions = topics.map((t) => ({ id: t.id, slug: t.slug, name: t.name }));
  const activeTopic = topicOptions.find((t) => t.id === activeTopicId) ?? null;

  return (
    <section aria-label="Aboneler">
      <PageHeader title="Aboneler" description="Digest alıcılarını yönetin" />
      <SubscribersClient
        initialSubscribers={subscribers}
        topics={topicOptions}
        activeTopicId={activeTopicId}
        activeTopicSlug={activeTopic?.slug ?? null}
        activeTopicName={activeTopic?.name ?? null}
        topicsBySubscriber={topicsBySubscriber}
      />
    </section>
  );
}
