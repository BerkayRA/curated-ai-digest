'use client';

/**
 * PreviewPanel — renders a live sandboxed iframe preview of the email.
 * Debounces re-render calls to avoid hammering the preview API.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { EditableItem } from './types';
import styles from './editor.module.css';

interface PreviewPanelProps {
  issueId: string;
  subject: string;
  preheader: string;
  isoWeek: string;
  items: readonly EditableItem[];
}

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export function PreviewPanel({ issueId, subject, preheader, isoWeek, items }: PreviewPanelProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const debouncedSubject = useDebounce(subject, 600);
  const debouncedPreheader = useDebounce(preheader, 600);
  const debouncedItems = useDebounce(items, 600);

  const fetchPreview = useCallback(async () => {
    if (debouncedItems.length < 2) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setPreviewError(null);

    try {
      const res = await fetch(`/api/issues/${issueId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          subject: debouncedSubject,
          preheader: debouncedPreheader,
          isoWeek,
          items: debouncedItems.map((item) => ({
            titleTr: item.titleTr,
            summaryTr: item.summaryTr,
            sourceUrl: item.sourceUrl,
            sourceName: item.sourceName,
          })),
        }),
      });

      if (!res.ok) {
        const data: { error?: string } = await res.json();
        setPreviewError(data.error ?? 'Önizleme oluşturulamadı');
        return;
      }

      const data: { success: boolean; data?: { html: string }; error?: string } = await res.json();

      if (data.success && data.data) {
        setHtml(data.data.html);
      } else {
        setPreviewError(data.error ?? 'Önizleme oluşturulamadı');
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setPreviewError('Önizleme yüklenemedi');
    } finally {
      setIsLoading(false);
    }
  }, [issueId, debouncedSubject, debouncedPreheader, isoWeek, debouncedItems]);

  useEffect(() => {
    void fetchPreview();
    return () => abortRef.current?.abort();
  }, [fetchPreview]);

  return (
    <div className={styles.previewPanel}>
      <div className={styles.previewHeader}>
        <span className={styles.previewLabel}>Canlı Önizleme</span>
        {isLoading && (
          <span className={styles.previewSpinner} aria-label="Yükleniyor" aria-live="polite" />
        )}
      </div>

      {previewError && (
        <div className={styles.previewError} role="alert">
          {previewError}
        </div>
      )}

      {html ? (
        <iframe
          className={styles.previewFrame}
          srcDoc={html}
          title="E-posta önizlemesi"
          sandbox=""
          aria-label="E-posta önizlemesi"
        />
      ) : (
        !isLoading && (
          <div className={styles.previewPlaceholder} aria-live="polite">
            Önizleme yükleniyor...
          </div>
        )
      )}
    </div>
  );
}
