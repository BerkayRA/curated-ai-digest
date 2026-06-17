import styles from './Badge.module.css';

type BadgeVariant = 'draft' | 'in_review' | 'approved' | 'scheduled' | 'sent' | 'failed' | 'cancelled' | 'active' | 'unsubscribed' | 'bounced';

interface BadgeProps {
  variant: BadgeVariant;
  label: string;
}

const VARIANT_LABELS: Record<BadgeVariant, string> = {
  draft: 'Taslak',
  in_review: 'İncelemede',
  approved: 'Onaylandı',
  scheduled: 'Planlandı',
  sent: 'Gönderildi',
  failed: 'Başarısız',
  cancelled: 'İptal',
  active: 'Aktif',
  unsubscribed: 'Abonelik İptal',
  bounced: 'Geri Döndü',
};

export function Badge({ variant, label }: BadgeProps) {
  const displayLabel = label || VARIANT_LABELS[variant] || variant;
  return (
    <span className={`${styles.badge} ${styles[variant]}`} aria-label={displayLabel}>
      {displayLabel}
    </span>
  );
}

export function issueStatusLabel(status: string): string {
  return VARIANT_LABELS[status as BadgeVariant] ?? status;
}

export function subscriberStatusLabel(status: string): string {
  return VARIANT_LABELS[status as BadgeVariant] ?? status;
}
