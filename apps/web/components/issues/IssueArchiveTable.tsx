import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
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
    <div className={styles.wrapper}>
      <table className={styles.table} aria-label="Bülten arşivi">
        <thead>
          <tr>
            <th scope="col" className={styles.th}>ISO Haftası</th>
            <th scope="col" className={styles.th}>Konu</th>
            <th scope="col" className={styles.th}>Durum</th>
            <th scope="col" className={styles.th}>Öğe</th>
            <th scope="col" className={styles.th}>Planlanma</th>
            <th scope="col" className={styles.th}>Gönderim</th>
            <th scope="col" className={styles.th}>Oluşturulma</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue) => (
            <tr key={issue.id} className={styles.row}>
              <td className={styles.td}>
                <span className={styles.isoWeek}>{issue.isoWeek}</span>
              </td>
              <td className={styles.td}>
                <Link href={`/issues/${issue.id}`} className={styles.subjectLink}>
                  {issue.subject}
                </Link>
                {issue.preheader && (
                  <p className={styles.preheader}>{issue.preheader}</p>
                )}
              </td>
              <td className={styles.td}>
                <Badge variant={issue.status} label={STATUS_LABELS[issue.status]} />
              </td>
              <td className={styles.td}>
                <span className={styles.itemCount}>{issue._count.items}</span>
              </td>
              <td className={styles.td}>{formatDate(issue.scheduledAt)}</td>
              <td className={styles.td}>
                {formatDate(issue.sentAt)}
                {issue.autoSent && (
                  <span className={styles.autoSentBadge} title="Otomatik gönderildi">Oto</span>
                )}
              </td>
              <td className={styles.td}>{formatDate(issue.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
