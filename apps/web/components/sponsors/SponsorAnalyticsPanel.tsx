import Link from 'next/link';
import type { Sponsor, SponsorIssueClickRow } from '@digest/db';
import { EyebrowLabel } from '@/components/ui/EyebrowLabel';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatCard } from '@/components/analytics/StatCard';
import { BarChart } from '@/components/analytics/BarChart';
import analyticsStyles from '@/components/analytics/analytics.module.css';
import styles from './sponsors.module.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SponsorAnalyticsPanelProps {
  sponsor: Sponsor;
  totalClicks: number;
  byIssue: SponsorIssueClickRow[];
}

// Truncate long subjects so the chart labels stay readable.
const LABEL_MAX = 22;

function shortSubject(subject: string): string {
  return subject.length > LABEL_MAX ? `${subject.slice(0, LABEL_MAX - 1)}…` : subject;
}

// ---------------------------------------------------------------------------
// SponsorAnalyticsPanel — per-sponsor performance: total engaged clicks stat
// plus a per-issue click breakdown reusing the dependency-free BarChart.
// ---------------------------------------------------------------------------

export function SponsorAnalyticsPanel({
  sponsor,
  totalClicks,
  byIssue,
}: SponsorAnalyticsPanelProps) {
  const chartItems = byIssue.map((row) => ({
    label: row.isoWeek
      ? `${row.isoWeek} · ${shortSubject(row.subject)}`
      : shortSubject(row.subject),
    value: row.clicks,
  }));

  return (
    <section aria-label="Sponsor performansı" className={analyticsStyles.wrap}>
      <Link href="/sponsors" className={styles.backLink}>
        ← Sponsorlar
      </Link>

      <EyebrowLabel className={analyticsStyles.topicTag}>{sponsor.name}</EyebrowLabel>

      <div className={analyticsStyles.statGrid}>
        <StatCard
          label="Sponsora gelen tıklamalar"
          value={totalClicks}
          sublabel="Tüm sponsorlu sayılardaki toplam tıklama"
        />
        <StatCard
          label="Sponsorlu sayı"
          value={byIssue.length}
          sublabel="Bu sponsorun yer aldığı sayı sayısı"
        />
      </div>

      <p className={analyticsStyles.note}>
        Tıklamalar sayı düzeyinde toplanır — bu sponsorun slotunu taşıyan sayılara gelen tıklamaları
        yansıtır.
      </p>

      <div className={analyticsStyles.panel}>
        <EyebrowLabel className={analyticsStyles.panelLabel}>Sayı Bazında Tıklamalar</EyebrowLabel>
        {chartItems.length === 0 ? (
          <EmptyState
            title="Henüz sponsorlu sayı yok"
            description="Bu sponsor bir sayıya eklendiğinde performans burada görünecek."
          />
        ) : (
          <BarChart items={chartItems} />
        )}
      </div>
    </section>
  );
}
