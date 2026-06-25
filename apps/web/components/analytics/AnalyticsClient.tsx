'use client';

import type {
  TopicAnalyticsSummary,
  IssueAnalyticsRow,
  ClickedUrlRow,
  GrowthPoint,
  HourlyOpenBucket,
} from '@digest/db';
import { EyebrowLabel } from '@/components/ui/EyebrowLabel';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusPill, type RingTone } from '@/components/ui/StatusPill';
import { StatCard } from './StatCard';
import { BarChart } from './BarChart';
import { SendTimeWidget } from './SendTimeWidget';
import styles from './analytics.module.css';

interface AnalyticsClientProps {
  summary: TopicAnalyticsSummary;
  issues: IssueAnalyticsRow[];
  topClicks: ClickedUrlRow[];
  growth: GrowthPoint[];
  topicName: string | null;
  sendTimeHint: HourlyOpenBucket[];
}

const ADOPT_THRESHOLD = 0.3;
const WATCH_THRESHOLD = 0.1;

/** Per-row engagement rate, guarding division by zero. */
function safeRate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

/** Map an engagement rate onto a ring tone for the table rate cells. */
function rateTone(value: number): RingTone {
  if (value >= ADOPT_THRESHOLD) return 'adopt';
  if (value >= WATCH_THRESHOLD) return 'watch';
  return 'pilot';
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatWeek(date: Date): string {
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' }).format(
    new Date(date),
  );
}

/**
 * Collapse a URL to a compact `host/first-path` label so the bar chart and list
 * stay readable. Falls back to the raw string when parsing fails.
 */
function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    const firstSegment = parsed.pathname.split('/').filter(Boolean)[0];
    return firstSegment ? `${host}/${firstSegment}` : host;
  } catch {
    return url;
  }
}

export function AnalyticsClient({
  summary,
  issues,
  topClicks,
  growth,
  topicName,
  sendTimeHint,
}: AnalyticsClientProps) {
  const hasSends = summary.totalSent > 0;

  if (!hasSends) {
    return (
      <section aria-label="Analitik" className={styles.wrap}>
        {topicName && <EyebrowLabel className={styles.topicTag}>{topicName}</EyebrowLabel>}
        <EmptyState
          title="Henüz gönderim yok"
          description="İlk sayı gönderildiğinde metrikler burada görünecek."
        />
      </section>
    );
  }

  const growthItems = growth.map((point) => ({
    label: formatWeek(point.week),
    value: point.additions,
  }));
  const clickItems = topClicks.map((row) => ({
    label: shortUrl(row.url),
    value: row.clickCount,
  }));

  return (
    <section aria-label="Analitik" className={styles.wrap}>
      {topicName && <EyebrowLabel className={styles.topicTag}>{topicName}</EyebrowLabel>}

      <div className={styles.statGrid}>
        <StatCard label="Toplam Gönderim" value={summary.totalSent} />
        <StatCard label="Açılma Oranı" value={formatPercent(summary.openRate)} />
        <StatCard label="Tıklama Oranı" value={formatPercent(summary.ctr)} />
        <StatCard label="Aktif Abone" value={summary.activeSubscribers} />
      </div>

      <p className={styles.note}>
        Açılma oranları yaklaşıktır — e-posta gizlilik korumaları açılışları şişirebilir.
      </p>

      <div className={styles.sendTimeRow}>
        <SendTimeWidget buckets={sendTimeHint} />
      </div>

      <div className={styles.panel}>
        <EyebrowLabel className={styles.panelLabel}>Abone Büyümesi</EyebrowLabel>
        <BarChart items={growthItems} />
      </div>

      <div className={styles.panel}>
        <EyebrowLabel className={styles.panelLabel}>En Çok Tıklanan Bağlantılar</EyebrowLabel>
        <BarChart items={clickItems} />
      </div>

      <div className={styles.panel}>
        <EyebrowLabel className={styles.panelLabel}>Sayı Geçmişi</EyebrowLabel>
        {issues.length === 0 ? (
          <EmptyState title="Henüz sayı yok" />
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Hafta</th>
                <th scope="col">Konu</th>
                <th scope="col">Gönderim</th>
                <th scope="col">Açılma</th>
                <th scope="col">Tıklama</th>
                <th scope="col">Açılma %</th>
                <th scope="col">Tıklama %</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((row) => {
                const openRate = safeRate(row.uniqueOpens, row.sentCount);
                const clickRate = safeRate(row.uniqueClicks, row.sentCount);
                return (
                  <tr key={row.issueId}>
                    <td className={styles.mono}>{row.isoWeek}</td>
                    <td className={styles.subjectCell} title={row.subject}>
                      {row.subject}
                    </td>
                    <td className={styles.mono}>{row.sentCount}</td>
                    <td className={styles.mono}>{row.uniqueOpens}</td>
                    <td className={styles.mono}>{row.uniqueClicks}</td>
                    <td>
                      <StatusPill tone={rateTone(openRate)} label={formatPercent(openRate)} />
                    </td>
                    <td>
                      <StatusPill tone={rateTone(clickRate)} label={formatPercent(clickRate)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
