import type { HourlyOpenBucket } from '@digest/db';
import { EyebrowLabel } from '@/components/ui/EyebrowLabel';
import { buildSendTimeRecommendation } from './send-time-format';
import styles from './analytics.module.css';

interface SendTimeWidgetProps {
  /** Open buckets (UTC) ordered by openCount desc; [] means insufficient data. */
  buckets: HourlyOpenBucket[];
}

/**
 * SendTimeWidget — advisory "Önerilen Gönderim Saati" card. Surfaces the
 * historical-open peak window so an editor can apply it manually in Konu
 * Ayarları. Does NOT auto-reschedule; times are UTC.
 */
export function SendTimeWidget({ buckets }: SendTimeWidgetProps) {
  const recommendation = buildSendTimeRecommendation(buckets);

  return (
    <article className={styles.statCard}>
      <EyebrowLabel as="p" className={styles.statLabel}>
        Önerilen Gönderim Saati
      </EyebrowLabel>

      {recommendation === null ? (
        <p className={styles.statSub}>
          Veri yetersiz — öneri için en az 20 açılma gerekli.
        </p>
      ) : (
        <>
          <p className={styles.sendWindow}>{recommendation.top.window}</p>
          <p className={styles.statSub}>
            {recommendation.top.openCount} açılma bu pencerede
          </p>

          {recommendation.runnersUp.length > 0 && (
            <ul className={styles.sendRunnersUp}>
              {recommendation.runnersUp.map((entry) => (
                <li key={entry.window}>
                  {entry.window} · {entry.openCount} açılma
                </li>
              ))}
            </ul>
          )}

          <p className={styles.sendNote}>
            Geçmiş açılmalara dayalı bir öneridir; otomatik yeniden planlama yapmaz.
            Konu Ayarları üzerinden elle uygulayabilirsiniz (saatler UTC).
          </p>
        </>
      )}
    </article>
  );
}
