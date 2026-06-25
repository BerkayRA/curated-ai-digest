import { prisma, createTopicRepository } from '@digest/db';
import { TopicsClient } from '@/components/topics/TopicsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Konular — Curated AI Digest',
};

export default async function TopicsPage() {
  const repo = createTopicRepository(prisma);
  const topics = await repo.findAll();

  return (
    <section aria-label="Konular">
      <TopicsClient topics={topics} />
    </section>
  );
}
