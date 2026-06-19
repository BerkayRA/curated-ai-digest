import { prisma, createSourceRepository } from '@digest/db';
import { SourcesClient } from '@/components/sources/SourcesClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Kaynaklar — Curated AI Digest',
};

export default async function SourcesPage() {
  const repo = createSourceRepository(prisma);
  const sources = await repo.findAll();
  const exaConfigured = Boolean(process.env.EXA_API_KEY);

  return (
    <section aria-label="Kaynaklar">
      <SourcesClient sources={sources} exaConfigured={exaConfigured} />
    </section>
  );
}
