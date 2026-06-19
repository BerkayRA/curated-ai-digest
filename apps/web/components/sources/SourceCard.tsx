'use client';

import { useState } from 'react';
import type { Source } from '@digest/db';
import type { ApiResponse } from '@/lib/api-response';
import { sourceBadge, formatHealthLine, typeFieldsVisible } from './sources-utils';
import styles from './sources.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TestFetchResult {
  readonly ok: boolean;
  readonly count: number;
  readonly sample: ReadonlyArray<{ title: string; sourceUrl: string }>;
  readonly errors: ReadonlyArray<{ source: string; message: string }>;
}

interface SourceCardProps {
  source: Source;
  exaKeyMissing: boolean;
  onEdit: (source: Source) => void;
  onDeleted: (id: string) => void;
  onToggled: (updated: Source) => void;
}

// ---------------------------------------------------------------------------
// Type badge class mapping
// ---------------------------------------------------------------------------

const BADGE_CLASS: Record<string, string | undefined> = {
  rss: styles.typeRss,
  radar: styles.typeRadar,
  exa: styles.typeExa,
};

// ---------------------------------------------------------------------------
// SourceCard
// ---------------------------------------------------------------------------

export function SourceCard({
  source,
  exaKeyMissing,
  onEdit,
  onDeleted,
  onToggled,
}: SourceCardProps) {
  const [toggling, setToggling] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestFetchResult | null>(null);

  const badge = sourceBadge(source.type);
  const healthLine = formatHealthLine(
    source.lastRunAt,
    source.lastStatus,
    source.lastCount,
    source.lastError,
  );

  const isExaDisabled = source.type === 'exa' && exaKeyMissing;
  const isDisabled = !source.enabled || isExaDisabled;

  // ── Toggle enabled ────────────────────────────────────────

  const handleToggle = async () => {
    if (toggling || isExaDisabled) return;
    setToggling(true);
    try {
      const res = await fetch(`/api/sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !source.enabled }),
      });
      const json = (await res.json()) as ApiResponse<Source>;
      if (json.success && json.data) {
        onToggled(json.data);
      }
    } finally {
      setToggling(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/sources/${source.id}`, { method: 'DELETE' });
      const json = (await res.json()) as ApiResponse<Source>;
      if (json.success) {
        onDeleted(source.id);
      }
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  // ── Test fetch ────────────────────────────────────────────

  const handleTest = async () => {
    if (testing || isExaDisabled) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/sources/${source.id}/test`, { method: 'POST' });
      const json = (await res.json()) as ApiResponse<TestFetchResult>;
      if (json.success && json.data) {
        setTestResult(json.data);
      }
    } finally {
      setTesting(false);
    }
  };

  // ── Health display ────────────────────────────────────────

  const hasRun = source.lastRunAt !== null;
  const healthTone =
    isExaDisabled
      ? 'warn'
      : hasRun
        ? source.lastStatus === 'ok'
          ? 'ok'
          : 'warn'
        : 'idle';

  const healthStateClass =
    healthTone === 'ok'
      ? styles.healthOk
      : healthTone === 'warn'
        ? styles.healthWarn
        : styles.healthIdle;

  const healthIcon = healthTone === 'ok' ? '✓' : healthTone === 'warn' ? '⚠' : null;

  const healthStateLabel = isExaDisabled
    ? '⚠ EXA_API_KEY gerekli'
    : hasRun
      ? source.lastStatus === 'ok'
        ? '✓ ok'
        : '⚠ uyarı'
      : null;

  // ── URL display for exa ───────────────────────────────────

  const { showUrl } = typeFieldsVisible(source.type);
  const queries =
    source.type === 'exa'
      ? ((source.config as Record<string, unknown> | null)?.queries as string[] | undefined)
      : undefined;
  const exaUrlLabel =
    queries && queries.length > 0
      ? `neural search · ${queries.length} sorgu`
      : 'neural search';

  return (
    <li
      className={`${styles.sourceCard} ${isDisabled ? styles.isDisabled : ''}`}
      aria-label={source.label}
    >
      {/* Card top: badge + toggle */}
      <div className={styles.cardTop}>
        <span className={`${styles.typeBadge} ${BADGE_CLASS[source.type] ?? ''}`}>
          <span aria-hidden="true">{badge.emoji}</span>
          {badge.label}
        </span>

        <label className={styles.toggleLabel}>
          <input
            type="checkbox"
            className={styles.toggleInput}
            checked={source.enabled}
            disabled={toggling || isExaDisabled}
            aria-label={`${source.label} kaynağını ${source.enabled ? 'devre dışı bırak' : 'etkinleştir'}`}
            onChange={handleToggle}
          />
          <span className={styles.toggleTrack} aria-hidden="true" />
        </label>
      </div>

      {/* Card identity */}
      <div className={styles.cardId}>
        <div className={styles.cardLabel}>{source.label}</div>
        {showUrl && source.url ? (
          <a
            className={styles.cardUrl}
            href={source.url}
            title={source.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {source.url}
          </a>
        ) : (
          <span className={styles.cardUrl} title={exaUrlLabel}>
            {exaUrlLabel}
          </span>
        )}
      </div>

      {/* Health line */}
      <div className={styles.health}>
        {healthStateLabel ? (
          <span className={`${styles.healthState} ${healthStateClass}`}>{healthStateLabel}</span>
        ) : (
          <span className={`${styles.healthState} ${healthStateClass}`}>
            {healthIcon ? `${healthIcon} ` : ''}
            {healthLine}
          </span>
        )}
        {healthStateLabel && hasRun && !isExaDisabled && (
          <>
            <span className={styles.healthDot} aria-hidden="true">
              ·
            </span>
            <span className={styles.healthMeta}>{healthLine}</span>
          </>
        )}
      </div>

      {/* Test result details */}
      {testResult !== null && (
        <div className={styles.testResult}>
          <details className={styles.testDetails} open>
            <summary className={styles.testSummary}>
              <i className={styles.testSummaryArrow} aria-hidden="true">
                ▸
              </i>
              {testResult.ok ? (
                <span className={styles.testSuccess}>✓ {testResult.count} aday bulundu</span>
              ) : (
                <span className={styles.healthWarn}>⚠ Tarama başarısız</span>
              )}
            </summary>
            <div className={styles.testBody}>
              {testResult.sample.length > 0 && (
                <ul className={styles.candidateList}>
                  {testResult.sample.map((item, idx) => (
                    <li key={item.sourceUrl} className={styles.candidateItem}>
                      <span className={styles.candidateNum}>
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span>{item.title}</span>
                    </li>
                  ))}
                </ul>
              )}
              {testResult.errors.map((e, idx) => (
                <div key={idx} className={styles.testError}>
                  <span aria-hidden="true">⚠</span>
                  <span>
                    {e.source}: {e.message}
                  </span>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* Card actions */}
      <div className={styles.cardActions}>
        <button
          type="button"
          className={styles.cardBtn}
          onClick={handleTest}
          disabled={testing || isExaDisabled}
          aria-busy={testing}
        >
          {testing ? '…' : 'Test'}
        </button>

        <button
          type="button"
          className={styles.cardBtn}
          onClick={() => onEdit(source)}
        >
          Düzenle
        </button>

        <span className={styles.cardActionsGrow} aria-hidden="true" />

        {deleteConfirm ? (
          <>
            <button
              type="button"
              className={`${styles.cardBtn} ${styles.cardBtnDanger}`}
              onClick={handleDelete}
              disabled={deleting}
              aria-busy={deleting}
            >
              {deleting ? '…' : 'Onayla'}
            </button>
            <button
              type="button"
              className={styles.cardBtn}
              onClick={() => setDeleteConfirm(false)}
            >
              İptal
            </button>
          </>
        ) : (
          <button
            type="button"
            className={`${styles.cardBtn} ${styles.cardBtnDanger}`}
            onClick={() => setDeleteConfirm(true)}
            aria-label={`${source.label} kaynağını sil`}
          >
            Sil
          </button>
        )}
      </div>
    </li>
  );
}
