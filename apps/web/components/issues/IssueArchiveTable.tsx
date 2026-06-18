import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';
import { EyebrowLabel } from '@/components/ui/EyebrowLabel';
import { StatusPill, issueStatusTone } from '@/components/ui/StatusPill';
import type { IssueStatus } from '@mega-bulten/db';
import styles from './IssueArchiveTable.module.css';

interface IssueRow {
  id: string;
  isoWeek: string;
  status: IssueStatus;
  subject: string;
  preheader: string | null;
  scheduledAt: Date | null;
  sentAt: Date | null;
  autoSent: boolean;
  createdAt: Date;
  _count: { items: number };
}

interface IssueArchiveTableProps {
  issues: IssueRow[];
}

const STATUS_LABELS: Record<IssueStatus, string> = {
  draft: 'Taslak',
  in_review: 'İncelemede',
  approved: 'Onaylandı',
  scheduled: 'Planlandı',
  sent: 'Gönderildi',
  failed: 'Başarısız',
  cancelled: 'İptal',
};

function formatDate(date: Date | null): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

/**
 * The most relevant date + its label for a given issue, so each card surfaces
 * one meaningful timestamp instead of a row of identical columns.
 */
function primaryDate(issue: IssueRow): { label: string; value: string } {
  if (issue.sentAt) return { label: 'Gönderildi', value: formatDate(issue.sentAt) };
  if (issue.scheduledAt)
    return { label: 'Planlanan gönderim', value: formatDate(issue.scheduledAt) };
  return { label: 'Oluşturuldu', value: formatDate(issue.createdAt) };
}

export function IssueArchiveTable({ issues }: IssueArchiveTableProps) {
  if (issues.length === 0) {
    return (
      <EmptyState
        title="Henüz bülten sayısı yok"
        description="Curation pipeline çalıştığında taslaklar burada görünecek."
      />
    );
  }

  return (
    <ul className={styles.archive} aria-label="Bülten arşivi">
      {issues.map((issue) => {
        const date = primaryDate(issue);
        return (
          <li key={issue.id}>
            <article className={styles.card}>
              <div className={styles.cardHead}>
                <EyebrowLabel as="span" mono className={styles.isoWeek}>
                  {issue.isoWeek}
                </EyebrowLabel>
                <StatusPill
                  tone={issueStatusTone(issue.status)}
                  label={STATUS_LABELS[issue.status]}
                />
              </div>

              <h2 className={styles.subject}>
                <Link href={`/issues/${issue.id}`} className={styles.subjectLink}>
                  {issue.subject}
                </Link>
              </h2>

              {issue.preheader && <p className={styles.preheader}>{issue.preheader}</p>}

              <div className={styles.cardFoot}>
                <span className={styles.metric}>
                  <span className={styles.metricKey}>{date.label}</span>
                  <span className={styles.metricValue}>{date.value}</span>
                </span>
                <span className={styles.metric}>
                  <span className={styles.metricKey}>Haber</span>
                  <span className={styles.metricValue}>{issue._count.items}</span>
                </span>
                {issue.autoSent && (
                  <span className={styles.metric}>
                    <span className={styles.metricKey}>Gönderim</span>
                    <span className={styles.metricValue}>Otomatik</span>
                  </span>
                )}
                <span className={styles.footSpacer} />
                <Link href={`/issues/${issue.id}`} className={styles.cardLink}>
                  Aç →
                </Link>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
