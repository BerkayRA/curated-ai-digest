import { cache } from 'react';
import { notFound } from 'next/navigation';
import { prisma, createSponsorRepository, createSponsorAnalyticsRepository } from '@digest/db';
import { SponsorAnalyticsPanel } from '@/components/sponsors/SponsorAnalyticsPanel';

export const dynamic = 'force-dynamic';

interface SponsorAnalyticsPageProps {
  params: { id: string };
}

// Deduplicate the sponsor lookup between generateMetadata and the page render
// within a single request (React cache) — one DB round-trip, not two.
const getSponsor = cache((id: string) => createSponsorRepository(prisma).findById(id));

export async function generateMetadata({ params }: SponsorAnalyticsPageProps) {
  const sponsor = await getSponsor(params.id);
  if (!sponsor) return { title: 'Bulunamadı — Curated AI Digest' };
  return { title: `${sponsor.name} performansı — Curated AI Digest` };
}

export default async function SponsorAnalyticsPage({ params }: SponsorAnalyticsPageProps) {
  const sponsor = await getSponsor(params.id);

  if (!sponsor) {
    notFound();
  }

  const analytics = createSponsorAnalyticsRepository(prisma);
  const [totalClicks, byIssue] = await Promise.all([
    analytics.getTotalSponsorClicks(params.id),
    analytics.getSponsorClicksByIssue(params.id),
  ]);

  return (
    <section aria-label="Sponsor performansı">
      <SponsorAnalyticsPanel sponsor={sponsor} totalClicks={totalClicks} byIssue={byIssue} />
    </section>
  );
}
