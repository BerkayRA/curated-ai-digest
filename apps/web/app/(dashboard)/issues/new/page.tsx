import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import issuesStyles from '../issues.module.css';

export const metadata = {
  title: 'Yeni Sayı — Mega Bülten',
};

// Drafts are produced by the Claude curation pipeline; this page surfaces that
// flow and links back to the archive. Kept minimal — issue editing happens in
// /issues/[id]. The archive's "Yeni Sayı" action points here.
export default function NewIssuePage() {
  return (
    <section aria-label="Yeni sayı">
      <PageHeader title="Yeni Sayı" description="Yeni bir bülten taslağı başlat." />
      <EmptyState
        title="Taslaklar curation pipeline ile oluşturulur"
        description="Haftalık curation pipeline çalıştığında yeni taslak otomatik olarak arşive eklenir ve düzenlemeye açılır."
        action={
          <Link href="/issues" className={issuesStyles.newLink}>
            ← Arşive dön
          </Link>
        }
      />
    </section>
  );
}
