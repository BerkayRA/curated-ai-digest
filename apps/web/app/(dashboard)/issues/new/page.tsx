import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { NewIssueForm } from '@/components/issues/NewIssueForm';
import { nextIsoWeek } from '@/lib/iso-week';
import issuesStyles from '../issues.module.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Yeni Sayı — Curated AI Digest',
};

/**
 * "Yeni Sayı" — the manual drafting flow. Editors hand-author a weekly issue
 * (1–3 items) here, or hand off to the Claude curation pipeline via the panel
 * at the bottom of the form. The default ISO week is computed server-side so
 * the field is pre-filled with the upcoming week.
 */
export default function NewIssuePage() {
  const defaultIsoWeek = nextIsoWeek();

  return (
    <section aria-label="Yeni sayı">
      <PageHeader
        title="Yeni Sayı"
        description="Yeni bir digest taslağı oluştur — elle yaz veya curation pipeline'a bırak."
        actions={
          <Link href="/issues" className={issuesStyles.newLink}>
            ← Arşive dön
          </Link>
        }
      />
      <NewIssueForm defaultIsoWeek={defaultIsoWeek} />
    </section>
  );
}
