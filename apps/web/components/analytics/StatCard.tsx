import { EyebrowLabel } from '@/components/ui/EyebrowLabel';
import styles from './analytics.module.css';

interface StatCardProps {
  /** Uppercase eyebrow kicker (e.g. "Toplam Gönderim"). */
  label: string;
  /** The headline figure — already formatted for display. */
  value: string | number;
  /** Optional muted sublabel beneath the value. */
  sublabel?: string;
}

/**
 * StatCard — a single KPI tile: eyebrow label + big mono number + optional
 * sublabel, sitting on the shared 3px Process-Blue top-rail card recipe.
 */
export function StatCard({ label, value, sublabel }: StatCardProps) {
  return (
    <article className={styles.statCard}>
      <EyebrowLabel as="p" className={styles.statLabel}>
        {label}
      </EyebrowLabel>
      <p className={styles.statValue}>{value}</p>
      {sublabel && <p className={styles.statSub}>{sublabel}</p>}
    </article>
  );
}
