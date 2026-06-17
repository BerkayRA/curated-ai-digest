'use client';

/**
 * AuditPanel — displays AuditLog entries for an issue.
 * Fetches from /api/issues/[id]/audit on mount.
 */

import { useEffect, useState } from 'react';
import styles from './editor.module.css';

interface AuditEntry {
  id: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditPanelProps {
  issueId: string;
}

function formatMeta(meta: Record<string, unknown>): string {
  return Object.entries(meta)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(' · ');
}

export function AuditPanel({ issueId }: AuditPanelProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/issues/${issueId}/audit`)
      .then((res) => res.json() as Promise<{ success: boolean; data?: AuditEntry[]; error?: string }>)
      .then((data) => {
        if (cancelled) return;
        if (data.success && data.data) {
          setEntries(data.data);
        } else {
          setError(data.error ?? 'Yüklenemedi');
        }
      })
      .catch(() => {
        if (!cancelled) setError('Yüklenemedi');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [issueId]);

  const fmt = new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <section className={styles.auditSection} aria-labelledby="audit-heading">
      <h2 id="audit-heading" className={styles.sectionTitle}>Geçmiş</h2>

      {isLoading && <p className={styles.auditLoading}>Yükleniyor…</p>}
      {error && <p className={styles.auditError} role="alert">{error}</p>}

      {!isLoading && entries.length === 0 && !error && (
        <p className={styles.auditEmpty}>Henüz kayıt yok.</p>
      )}

      <ol className={styles.auditList} aria-label="Denetim günlüğü">
        {entries.map((entry) => (
          <li key={entry.id} className={styles.auditItem}>
            <div className={styles.auditAction}>{entry.action}</div>
            <div className={styles.auditMeta}>
              <span className={styles.auditActor}>{entry.actorId ?? 'sistem'}</span>
              <span className={styles.auditSep}>·</span>
              <time dateTime={entry.createdAt} className={styles.auditTime}>
                {fmt.format(new Date(entry.createdAt))}
              </time>
              {entry.meta !== null && (
                <>
                  <span className={styles.auditSep}>·</span>
                  <span className={styles.auditDetails}>{formatMeta(entry.meta)}</span>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
