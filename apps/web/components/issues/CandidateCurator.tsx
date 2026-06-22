'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EyebrowLabel } from '@/components/ui/EyebrowLabel';
import type { ApiResponse } from '@/lib/api-response';
import styles from './candidate-curator.module.css';

// ---------------------------------------------------------------------------
// Wire types (match GET /api/candidates/recent)
// ---------------------------------------------------------------------------

interface CuratorCandidate {
  id: string | null;
  title: string;
  sourceUrl: string;
  sourceName: string;
  rawExcerpt: string | null;
  publishedAt: string | null;
}

interface SourceGroupWire {
  sourceName: string;
  items: CuratorCandidate[];
}

interface RecentResponse {
  scannedAt: string | null;
  source: 'db' | 'file' | 'empty';
  total: number;
  sources: SourceGroupWire[];
}

/** A draft item produced by picking a candidate — matches the form's DraftItem. */
export interface PickedDraft {
  titleTr: string;
  summaryTr: string;
  sourceUrl: string;
  sourceName: string;
  candidateArticleId?: string;
}

interface CandidateCuratorProps {
  open: boolean;
  /** Source URLs already in the draft — used to mark cards as added. */
  addedUrls: ReadonlySet<string>;
  /** True when all 3 slots are filled — adding is blocked until one frees up. */
  slotsFull: boolean;
  onPick: (draft: PickedDraft) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
}

function toDraft(c: CuratorCandidate): PickedDraft {
  // LLM-free: raw title + excerpt (editor polishes to Turkish). summaryTr must
  // be non-empty, so fall back to the title when there's no excerpt.
  const summary = (c.rawExcerpt ?? '').trim() || c.title;
  return {
    titleTr: c.title,
    summaryTr: summary,
    sourceUrl: c.sourceUrl,
    sourceName: c.sourceName,
    ...(c.id ? { candidateArticleId: c.id } : {}),
  };
}

// ---------------------------------------------------------------------------
// CandidateCurator — LLM-free picker slide-over
// ---------------------------------------------------------------------------

/**
 * A slide-over that lists the recently-scanned candidate pool grouped by source
 * (top 3 each). Clicking "Ekle" hands a draft item up to the new-issue form,
 * which fills the next slot. No LLM, no API key — reads GET /api/candidates/recent.
 */
export function CandidateCurator({ open, addedUrls, slotsFull, onPick, onClose }: CandidateCuratorProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RecentResponse | null>(null);

  // Fetch the pool each time the panel opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch('/api/candidates/recent')
      .then((r) => r.json() as Promise<ApiResponse<RecentResponse>>)
      .then((json) => {
        if (cancelled) return;
        if (!json.success || !json.data) {
          setError(json.error ?? 'Adaylar yüklenemedi.');
          return;
        }
        setData(json.data);
      })
      .catch(() => {
        if (!cancelled) setError('Beklenmeyen bir hata oluştu.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  // Focus the close button on open + ESC to close.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handlePick = useCallback((c: CuratorCandidate) => onPick(toDraft(c)), [onPick]);

  const isEmpty = !loading && !error && data !== null && data.sources.length === 0;

  return (
    <>
      <div
        className={`${styles.scrim} ${open ? styles.scrimOpen : ''}`}
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Haber kürasyonu"
        className={`${styles.panel} ${open ? styles.panelOpen : ''}`}
      >
        <div className={styles.panelHead}>
          <div className={styles.panelHeadText}>
            <EyebrowLabel as="span">LLM&apos;siz kürasyon</EyebrowLabel>
            <h3 className={styles.panelTitle}>Taranan Haberler</h3>
            {data?.scannedAt && (
              <p className={styles.scanMeta}>
                Son tarama: {formatDate(data.scannedAt)} · {data.total} aday
              </p>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            className={styles.panelClose}
            aria-label="Paneli kapat"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className={styles.panelBody}>
          {slotsFull && (
            <p className={styles.notice} role="status">
              3 haber dolu — yeni eklemek için önce bir slotu kaldırın.
            </p>
          )}

          {loading && <p className={styles.muted}>Yükleniyor…</p>}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          {isEmpty && (
            <p className={styles.muted}>
              Taranmış haber bulunamadı. Önce <strong>Kaynaklar</strong> sayfasında “Şimdi Tara”
              ile bir tarama yapın.
            </p>
          )}

          {!loading &&
            !error &&
            data?.sources.map((group) => (
              <section key={group.sourceName} className={styles.group}>
                <h4 className={styles.groupTitle}>{group.sourceName}</h4>
                <ul className={styles.cards}>
                  {group.items.map((c) => {
                    const added = addedUrls.has(c.sourceUrl);
                    return (
                      <li key={c.sourceUrl} className={styles.card}>
                        <div className={styles.cardMain}>
                          <p className={styles.cardTitle}>{c.title}</p>
                          {c.rawExcerpt && <p className={styles.cardExcerpt}>{c.rawExcerpt}</p>}
                          {c.publishedAt && <span className={styles.cardDate}>{formatDate(c.publishedAt)}</span>}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={added ? 'ghost' : 'secondary'}
                          disabled={added || slotsFull}
                          onClick={() => handlePick(c)}
                          aria-label={`${c.title} — habere ekle`}
                        >
                          {added ? '✓ Eklendi' : 'Ekle'}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
        </div>
      </div>
    </>
  );
}
