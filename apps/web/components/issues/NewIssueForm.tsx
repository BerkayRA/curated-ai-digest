'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { EyebrowLabel } from '@/components/ui/EyebrowLabel';
import { RunPipelineButton } from '@/components/issues/RunPipelineButton';
import { CandidateCurator, type PickedDraft } from '@/components/issues/CandidateCurator';
import type { ApiResponse } from '@/lib/api-response';
import styles from '@/app/(dashboard)/issues/new/new-issue.module.css';

const MAX_ITEMS = 3;
const MIN_ITEMS = 1;

interface DraftItem {
  titleTr: string;
  summaryTr: string;
  sourceUrl: string;
  sourceName: string;
  /** Set when the item came from a scanned candidate — links the IssueItem back. */
  candidateArticleId?: string;
}

interface NewIssueFormProps {
  /** Pre-filled ISO week — defaults to next week, computed server-side. */
  defaultIsoWeek: string;
}

const emptyItem = (): DraftItem => ({
  titleTr: '',
  summaryTr: '',
  sourceUrl: '',
  sourceName: '',
});

export function NewIssueForm({ defaultIsoWeek }: NewIssueFormProps) {
  const router = useRouter();

  const [isoWeek, setIsoWeek] = useState(defaultIsoWeek);
  const [subject, setSubject] = useState('');
  const [preheader, setPreheader] = useState('');
  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [curatorOpen, setCuratorOpen] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [curateStatus, setCurateStatus] = useState<string | null>(null);

  const updateItem = useCallback(
    (index: number, field: 'titleTr' | 'summaryTr' | 'sourceUrl' | 'sourceName', value: string) => {
      // Immutable update — never mutate the existing items array/objects. Editing
      // a field unlinks it from its candidate (the text no longer matches).
      setItems((prev) =>
        prev.map((item, i) => {
          if (i !== index) return item;
          const next: DraftItem = { ...item, [field]: value };
          delete next.candidateArticleId; // editing unlinks the item from its candidate
          return next;
        }),
      );
    },
    [],
  );

  const addItem = useCallback(() => {
    setItems((prev) => (prev.length >= MAX_ITEMS ? prev : [...prev, emptyItem()]));
  }, []);

  const removeItem = useCallback((index: number) => {
    setItems((prev) => (prev.length <= MIN_ITEMS ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  // ── LLM-free curation ─────────────────────────────────────

  const isBlank = (it: DraftItem): boolean =>
    !it.titleTr && !it.summaryTr && !it.sourceUrl && !it.sourceName;

  /** Add a picked candidate: fill the first blank slot, else append (max 3). */
  const addDraft = useCallback((draft: PickedDraft) => {
    setItems((prev) => {
      if (draft.sourceUrl && prev.some((it) => it.sourceUrl === draft.sourceUrl)) return prev; // dedup
      const blankIdx = prev.findIndex(isBlank);
      if (blankIdx !== -1) return prev.map((it, i) => (i === blankIdx ? { ...draft } : it));
      if (prev.length >= MAX_ITEMS) return prev;
      return [...prev, { ...draft }];
    });
  }, []);

  /** Replace all slots with the heuristic auto-curate result. */
  const handleAutoCurate = useCallback(async () => {
    setAutoLoading(true);
    setFormError(null);
    setCurateStatus(null);
    try {
      const res = await fetch('/api/candidates/auto');
      const json = (await res.json()) as ApiResponse<{ items: DraftItem[]; total: number }>;
      if (!json.success || !json.data) {
        setFormError(json.error ?? 'Otomatik kürasyon başarısız.');
        return;
      }
      if (json.data.items.length === 0) {
        setFormError('Taranmış haber bulunamadı. Önce Kaynaklar sayfasında bir tarama yapın.');
        return;
      }
      setItems(json.data.items.slice(0, MAX_ITEMS).map((d) => ({ ...d })));
      setCurateStatus(`${json.data.items.length} haber otomatik dolduruldu — düzenleyip oluşturun.`);
    } catch {
      setFormError('Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setAutoLoading(false);
    }
  }, []);

  const addedUrls = new Set(items.map((it) => it.sourceUrl).filter(Boolean));
  const filledCount = items.filter((it) => !isBlank(it)).length;
  const slotsFull = filledCount >= MAX_ITEMS;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isoWeek,
          subject,
          preheader: preheader.trim() ? preheader : undefined,
          items,
        }),
      });

      const json = (await res.json()) as ApiResponse<{ id: string }>;
      if (!json.success || !json.data) {
        setFormError(json.error ?? 'Taslak oluşturulamadı.');
        return;
      }

      router.push(`/issues/${json.data.id}`);
    } catch {
      setFormError('Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setSubmitting(false);
    }
  };

  const canAdd = items.length < MAX_ITEMS;
  const canRemove = items.length > MIN_ITEMS;

  return (
    <form onSubmit={handleSubmit} className={styles.form} noValidate>
      {formError && (
        <p className={styles.formError} role="alert">
          {formError}
        </p>
      )}

      {/* ── Meta ───────────────────────────────────────── */}
      <section className={styles.section} aria-labelledby="meta-heading">
        <div className={styles.sectionHead}>
          <div className={styles.sectionHeadText}>
            <EyebrowLabel as="span">Sayı bilgisi</EyebrowLabel>
            <h2 id="meta-heading" className={styles.sectionTitle}>
              Sayı Künyesi
            </h2>
          </div>
        </div>

        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label htmlFor="iso-week" className={styles.label}>
              ISO Hafta
            </label>
            <input
              id="iso-week"
              type="text"
              className={`${styles.input} ${styles.inputMono}`}
              value={isoWeek}
              onChange={(e) => setIsoWeek(e.target.value)}
              placeholder="2026-W24"
              aria-describedby="iso-week-hint"
            />
            <span id="iso-week-hint" className={styles.hint}>
              YYYY-Wnn biçiminde — varsayılan, gelecek hafta.
            </span>
          </div>

          <div className={`${styles.field} ${styles.fieldWide}`}>
            <label htmlFor="subject" className={styles.label}>
              Konu Başlığı
            </label>
            <input
              id="subject"
              type="text"
              className={styles.input}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Bu hafta yapay zekâda öne çıkanlar"
            />
          </div>

          <div className={`${styles.field} ${styles.fieldWide}`}>
            <label htmlFor="preheader" className={styles.label}>
              Ön İzleme Metni <span className={styles.hint}>(isteğe bağlı)</span>
            </label>
            <input
              id="preheader"
              type="text"
              className={styles.input}
              value={preheader}
              onChange={(e) => setPreheader(e.target.value)}
              placeholder="Gelen kutusunda konu başlığının yanında görünür"
            />
          </div>
        </div>
      </section>

      {/* ── Items editor ───────────────────────────────── */}
      <section className={styles.section} aria-labelledby="items-heading">
        <div className={styles.sectionHead}>
          <div className={styles.sectionHeadText}>
            <EyebrowLabel as="span">İçerik</EyebrowLabel>
            <h2 id="items-heading" className={styles.sectionTitle}>
              Haberler
            </h2>
            <p className={styles.sectionHint}>Sayı başına 1–3 haber.</p>
          </div>
          <span className={styles.itemsCount} aria-live="polite">
            {items.length}/{MAX_ITEMS}
          </span>
        </div>

        {/* LLM-free curation: pick from scanned news, or auto-fill heuristically. */}
        <div className={styles.curateBar}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setCuratorOpen(true)}
          >
            ✦ Curate
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAutoCurate}
            loading={autoLoading}
          >
            Otomatik kürasyon (LLM&apos;siz)
          </Button>
          <span className={styles.curateBarHint}>
            Taranan haberlerden seçin ya da otomatik doldurun — LLM gerektirmez.
          </span>
        </div>

        {curateStatus && (
          <p className={styles.curateStatus} role="status">
            {curateStatus}
          </p>
        )}

        <ul className={styles.items}>
          {items.map((item, index) => (
            <li key={index} className={styles.item}>
              <div className={styles.itemHead}>
                <EyebrowLabel as="span" mono className={styles.itemOrdinal}>
                  Haber {String(index + 1).padStart(2, '0')}
                </EyebrowLabel>
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => removeItem(index)}
                  disabled={!canRemove}
                  aria-label={`Haber ${index + 1} kaldır`}
                >
                  Kaldır
                </button>
              </div>

              <div className={styles.itemFields}>
                <div className={styles.field}>
                  <label htmlFor={`item-title-${index}`} className={styles.label}>
                    Başlık
                  </label>
                  <input
                    id={`item-title-${index}`}
                    type="text"
                    className={styles.input}
                    value={item.titleTr}
                    onChange={(e) => updateItem(index, 'titleTr', e.target.value)}
                    placeholder="Haber başlığı"
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor={`item-summary-${index}`} className={styles.label}>
                    Özet
                  </label>
                  <textarea
                    id={`item-summary-${index}`}
                    className={styles.textarea}
                    value={item.summaryTr}
                    onChange={(e) => updateItem(index, 'summaryTr', e.target.value)}
                    placeholder="Haberin kısa Türkçe özeti"
                  />
                </div>

                <div className={styles.itemRow}>
                  <div className={styles.field}>
                    <label htmlFor={`item-url-${index}`} className={styles.label}>
                      Kaynak URL
                    </label>
                    <input
                      id={`item-url-${index}`}
                      type="url"
                      className={styles.input}
                      value={item.sourceUrl}
                      onChange={(e) => updateItem(index, 'sourceUrl', e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor={`item-source-${index}`} className={styles.label}>
                      Kaynak Adı
                    </label>
                    <input
                      id={`item-source-${index}`}
                      type="text"
                      className={styles.input}
                      value={item.sourceName}
                      onChange={(e) => updateItem(index, 'sourceName', e.target.value)}
                      placeholder="Örn. OpenAI Blog"
                    />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={addItem}
          disabled={!canAdd}
          className={styles.addBtn}
        >
          + Haber ekle
        </Button>
      </section>

      <div className={styles.formActions}>
        <Button type="submit" loading={submitting}>
          Taslağı Oluştur
        </Button>
        <Link href="/issues" className={styles.cancelLink}>
          Vazgeç
        </Link>
      </div>

      {/* Pipeline trigger — an alternative to hand-authoring: let the Claude
          curation pipeline draft the issue for the same week. */}
      <RunPipelineButton isoWeek={isoWeek} />

      {/* LLM-free manual picker — pull top scanned news per source into slots. */}
      <CandidateCurator
        open={curatorOpen}
        addedUrls={addedUrls}
        slotsFull={slotsFull}
        onPick={addDraft}
        onClose={() => setCuratorOpen(false)}
      />
    </form>
  );
}
