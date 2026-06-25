import { prisma, createSourceRepository } from '@digest/db';
import { SourcesClient } from '@/components/sources/SourcesClient';
import { resolveTopicIdBySlug } from '@/lib/resolve-topic';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Kaynaklar — Curated AI Digest',
};

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: { topic?: string };
}) {
  const topicId = await resolveTopicIdBySlug(searchParams.topic);
  const repo = createSourceRepository(prisma);
  const sources = await repo.findAllByTopic(topicId);
  const exaConfigured = Boolean(process.env.EXA_API_KEY);

  return (
    <section aria-label="Kaynaklar">
      <SourcesClient sources={sources} exaConfigured={exaConfigured} topicSlug={searchParams?.topic} />
    </section>
  );
}
