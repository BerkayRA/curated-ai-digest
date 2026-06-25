'use client';

import { useCallback, useState } from 'react';
import { EyebrowLabel } from '@/components/ui/EyebrowLabel';
import { Button } from '@/components/ui/Button';
import type { ApiResponse } from '@/lib/api-response';
import type { DeliverabilityResult, DnsRecord, DnsCheckStatus } from '@/lib/dns-check';
import styles from './deliverability.module.css';

interface DeliverabilityCardProps {
  initial: DeliverabilityResult;
  fromAddress: string;
  dkimSelector: string;
}

const STATUS_LABELS: Record<DnsCheckStatus, string> = {
  pass: 'Geçti',
  warn: 'Uyarı',
  fail: 'Başarısız',
  unknown: 'Bilinmiyor',
};

/** Maps a status to its chip CSS-module class (matches Button's `styles[...]` use). */
function statusClass(status: DnsCheckStatus): string {
  const byStatus: Record<DnsCheckStatus, string> = {
    pass: styles.chipPass ?? '',
    warn: styles.chipWarn ?? '',
    fail: styles.chipFail ?? '',
    unknown: styles.chipUnknown ?? '',
  };
  return byStatus[status];
}

/** Turkish relative-time formatting for the "Son kontrol" timestamp. */
function formatRelative(date: Date): string {
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return 'az önce';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} dakika önce`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} saat önce`;
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' }).format(date);
}

function Chip({ record }: { record: DnsRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={styles.chipItem}>
      <button
        type="button"
        className={`${styles.chip} ${statusClass(record.status)}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.chipDot} aria-hidden="true" />
        <span className={styles.chipName}>{record.name}</span>
        <span className={styles.chipStatus}>{STATUS_LABELS[record.status]}</span>
      </button>
      {open && (
        <div className={styles.chipDetail}>
          <code className={styles.detailText}>{record.detail}</code>
          {record.hint && <p className={styles.detailHint}>{record.hint}</p>}
        </div>
      )}
    </li>
  );
}

export function DeliverabilityCard({ initial, fromAddress, dkimSelector }: DeliverabilityCardProps) {
  const [result, setResult] = useState<DeliverabilityResult>({
    ...initial,
    checkedAt: new Date(initial.checkedAt),
  });
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = useCallback(async () => {
    setError(null);
    setChecking(true);
    try {
      const res = await fetch('/api/deliverability/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromAddress, dkimSelector }),
      });
      const json = (await res.json()) as ApiResponse<DeliverabilityResult>;
      if (!json.success || !json.data) {
        setError(json.error ?? 'Kontrol başarısız.');
        return;
      }
      setResult({ ...json.data, checkedAt: new Date(json.data.checkedAt) });
    } catch {
      setError('Kontrol başarısız. Lütfen tekrar deneyin.');
    } finally {
      setChecking(false);
    }
  }, [fromAddress, dkimSelector]);

  return (
    <section className={styles.card} aria-labelledby="deliverability-heading">
      <div className={styles.head}>
        <div className={styles.headText}>
          <EyebrowLabel as="span">Kimlik Doğrulama</EyebrowLabel>
          <h2 id="deliverability-heading" className={styles.title}>
            Teslimat Sağlığı
          </h2>
          <p className={styles.domain}>
            {result.domain || 'Gönderen adresi tanımlı değil'}
          </p>
        </div>
        <Button size="sm" variant="secondary" loading={checking} onClick={handleCheck}>
          Kontrol Et
        </Button>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <ul className={styles.chipList}>
        {result.records.map((record) => (
          <Chip key={record.name} record={record} />
        ))}
      </ul>

      <p className={styles.timestamp}>Son kontrol: {formatRelative(result.checkedAt)}</p>
    </section>
  );
}
