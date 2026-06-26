import { prisma, createSponsorRepository } from '@digest/db';
import { SponsorsClient } from '@/components/sponsors/SponsorsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Sponsorlar — Curated AI Digest',
};

export default async function SponsorsPage() {
  const repo = createSponsorRepository(prisma);
  const sponsors = await repo.findAll();

  return (
    <section aria-label="Sponsorlar">
      <SponsorsClient sponsors={sponsors} />
    </section>
  );
}
