'use client';

/**
 * AbTestPanel — A/B konu satırı testi yönetimi.
 *
 * Taslak / incelemede: testi aç/kapat, iki konu varyantı ve holdout süresi gir,
 * kaydet. Gönderilmiş ve test/seçim/tamamlandı durumundaki sayılar: varyant
 * başına açılma oranlarını ve (tamamlandıysa) kazanan rozetini göster.
 */

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { EyebrowLabel } from '@/components/ui/EyebrowLabel';
import type { AbStatusValue } from '@digest/shared';
import styles from './ab-test.module.css';

const DEFAULT_HOLDOUT_MINUTES = 240;
const SUBJECT_MAX = 200;

interface VariantStat {
  readonly variantIndex: number;
  readonly subject: string;
  readonly sentCount: number;
  readonly openCount: number;
}

interface AbTestPanelProps {
  readonly issueId: string;
  readonly status: string;
  readonly abStatus: AbStatusValue;
  readonly abWinnerVariantIndex: number | null;
  readonly initialVariants: readonly VariantStat[];
}

const VARIANT_LABELS = ['Varyant A', 'Varyant B'] as const;

function openRate(stat: VariantStat): string {
  if (stat.sentCount === 0) return '—';
  return `%${Math.round((stat.openCount / stat.sentCount) * 100)}`;
}

export function AbTestPanel({
  issueId,
  status,
  abStatus,
  abWinnerVariantIndex,
  initialVariants,
}: AbTestPanelProps) {
  const isEditable = status === 'draft' || status === 'in_review';
  const isResults = !isEditable && abStatus !== 'none';

  if (isResults) {
    return (
      <AbResults
        abStatus={abStatus}
        abWinnerVariantIndex={abWinnerVariantIndex}
        initialVariants={initialVariants}
        issueId={issueId}
      />
    );
  }

  if (!isEditable) return null;

  return <AbEditor issueId={issueId} initialVariants={initialVariants} />;
}

// ---------------------------------------------------------------------------
// Editor (draft / in_review)
// ---------------------------------------------------------------------------

function AbEditor({
  issueId,
  initialVariants,
}: {
  issueId: string;
  initialVariants: readonly VariantStat[];
}) {
  const [enabled, setEnabled] = useState(initialVariants.length >= 2);
  const [subjectA, setSubjectA] = useState(initialVariants[0]?.subject ?? '');
  const [subjectB, setSubjectB] = useState(initialVariants[1]?.subject ?? '');
  const [holdout, setHoldout] = useState(DEFAULT_HOLDOUT_MINUTES);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const canSave = enabled && subjectA.trim().length > 0 && subjectB.trim().length > 0;

  const handleSave = useCallback(async () => {
    setSaveState('saving');
    setError(null);
    try {
      const res = await fetch(`/api/issues/${issueId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          { variantIndex: 0, subject: subjectA.trim() },
          { variantIndex: 1, subject: subjectB.trim() },
        ]),
      });
      const data: { success: boolean; error?: string } = await res.json();
      if (!data.success) {
        setSaveState('error');
        setError(data.error ?? 'Kaydedilemedi');
        return;
      }
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      setSaveState('error');
      setError('Ağ hatası');
    }
  }, [issueId, subjectA, subjectB]);

  return (
    <section className={styles.panel} aria-labelledby="ab-test-heading">
      <div className={styles.head}>
        <div className={styles.headText}>
          <EyebrowLabel as="span">Optimizasyon</EyebrowLabel>
          <h2 id="ab-test-heading" className={styles.title}>
            A/B Konu Testi
          </h2>
        </div>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className={styles.toggleInput}
          />
          <span className={styles.toggleTrack} aria-hidden="true" />
          <span className={styles.toggleLabel}>{enabled ? 'Açık' : 'Kapalı'}</span>
        </label>
      </div>

      {enabled && (
        <div className={styles.body}>
          <p className={styles.hint}>
            Test grubuna iki farklı konu satırı gönderilir; holdout süresi sonunda en yüksek
            açılma oranına sahip varyant kalan alıcılara iletilir.
          </p>

          <div className={styles.fieldGroup}>
            <label htmlFor="ab-subject-a" className={styles.label}>
              Varyant A — Konu
            </label>
            <input
              id="ab-subject-a"
              className={styles.input}
              value={subjectA}
              maxLength={SUBJECT_MAX}
              onChange={(e) => setSubjectA(e.target.value)}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="ab-subject-b" className={styles.label}>
              Varyant B — Konu
            </label>
            <input
              id="ab-subject-b"
              className={styles.input}
              value={subjectB}
              maxLength={SUBJECT_MAX}
              onChange={(e) => setSubjectB(e.target.value)}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="ab-holdout" className={styles.label}>
              Holdout süresi (dakika)
            </label>
            <input
              id="ab-holdout"
              type="number"
              min={5}
              className={styles.inputNarrow}
              value={holdout}
              onChange={(e) => setHoldout(Number(e.target.value))}
            />
          </div>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <div className={styles.actions}>
            <Button
              variant="primary"
              size="sm"
              disabled={!canSave}
              loading={saveState === 'saving'}
              onClick={handleSave}
            >
              {saveState === 'saved' ? 'Kaydedildi' : 'Varyantları Kaydet'}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Results (sent + abStatus testing/selecting/completed)
// ---------------------------------------------------------------------------

const AB_STATUS_LABELS: Record<AbStatusValue, string> = {
  none: 'Test yok',
  testing: 'Test sürüyor',
  selecting: 'Kazanan seçiliyor',
  completed: 'Tamamlandı',
};

function AbResults({
  issueId,
  abStatus,
  abWinnerVariantIndex,
  initialVariants,
}: {
  issueId: string;
  abStatus: AbStatusValue;
  abWinnerVariantIndex: number | null;
  initialVariants: readonly VariantStat[];
}) {
  const [variants, setVariants] = useState<readonly VariantStat[]>(initialVariants);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch(`/api/issues/${issueId}/variants`);
        const data: { success: boolean; data?: VariantStat[] } = await res.json();
        if (active && data.success && data.data) setVariants(data.data);
      } catch {
        // Non-fatal: fall back to server-rendered initial counts.
      }
    })();
    return () => {
      active = false;
    };
  }, [issueId]);

  return (
    <section className={styles.panel} aria-labelledby="ab-results-heading">
      <div className={styles.head}>
        <div className={styles.headText}>
          <EyebrowLabel as="span">Optimizasyon</EyebrowLabel>
          <h2 id="ab-results-heading" className={styles.title}>
            A/B Konu Testi
          </h2>
        </div>
        <span className={styles.statusChip} data-status={abStatus}>
          {AB_STATUS_LABELS[abStatus]}
        </span>
      </div>

      <ul className={styles.resultList}>
        {variants.map((v) => {
          const isWinner = abStatus === 'completed' && v.variantIndex === abWinnerVariantIndex;
          return (
            <li
              key={v.variantIndex}
              className={styles.resultRow}
              data-winner={isWinner ? 'true' : undefined}
            >
              <div className={styles.resultMeta}>
                <span className={styles.variantTag}>
                  {VARIANT_LABELS[v.variantIndex] ?? `Varyant ${v.variantIndex}`}
                </span>
                {isWinner && <span className={styles.winnerBadge}>Kazanan</span>}
              </div>
              <p className={styles.resultSubject}>{v.subject}</p>
              <div className={styles.resultStats}>
                <span className={styles.rate}>{openRate(v)}</span>
                <span className={styles.counts}>
                  {v.openCount} / {v.sentCount} açılma
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
