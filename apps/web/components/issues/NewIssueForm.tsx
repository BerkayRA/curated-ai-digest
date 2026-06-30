'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { pickFirstUnused } from '@digest/curation/curate';
import { Button } from '@/components/ui/Button';
import { EyebrowLabel } from '@/components/ui/EyebrowLabel';
import { RunPipelineButton } from '@/components/issues/RunPipelineButton';
import {
  CandidateCurator,
  candidateToPickedDraft,
  type PickedDraft,
  type SourceGroupWire,
} from '@/components/issues/CandidateCurator';
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
  /** Active topic slug — scopes candidate fetches and the created draft. */
  topicSlug?: string;
}

/** Build a `?topic=<slug>` query suffix, or empty string when no slug. */
function topicQuery(slug: string | undefined): string {
  return slug ? `?topic=${encodeURIComponent(slug)}` : '';
}

const emptyItem = (): DraftItem => ({
  titleTr: '',
  summaryTr: '',
  sourceUrl: '',
  sourceName: '',
});

export function NewIssueForm({ defaultIsoWeek, topicSlug }: NewIssueFormProps) {
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

  // Scanned candidate pool — fetched once and shared by the picker (CandidateCurator)
  // and the per-slot "Kaynaktan doldur" dropdowns. Container/presentational split.
  interface CandData {
    scannedAt: string | null;
    total: number;
    sources: SourceGroupWire[];
  }
  const [candData, setCandData] = useState<CandData | null>(null);
  const [candLoading, setCandLoading] = useState(true);
  const [candError, setCandError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Intentional loading-state set for an on-mount async fetch (not a
    // props→state sync); this is the sanctioned data-fetch effect pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCandLoading(true);
    fetch(`/api/candidates/recent${topicQuery(topicSlug)}`)
      .then((r) => r.json() as Promise<ApiResponse<CandData>>)
      .then((json) => {
        if (cancelled) return;
        if (!json.success || !json.data) {
          setCandError(json.error ?? 'Adaylar yüklenemedi.');
          return;
        }
        setCandData(json.data);
      })
      .catch(() => {
        if (!cancelled) setCandError('Beklenmeyen bir hata oluştu.');
      })
      .finally(() => {
        if (!cancelled) setCandLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [topicSlug]);

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
      const res = await fetch(`/api/candidates/auto${topicQuery(topicSlug)}`);
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
  }, [topicSlug]);

  /** Fill one slot from a chosen source: its top article not already used in any
   *  slot (so re-picking the same source yields the next one). */
  const fillSlotFromSource = useCallback(
    (index: number, sourceName: string) => {
      if (!sourceName || !candData) return;
      setFormError(null);
      const group = candData.sources.find((g) => g.sourceName === sourceName);
      if (!group) return;
      const used = new Set(items.map((it) => it.sourceUrl).filter(Boolean));
      const next = pickFirstUnused(group.items, used);
      if (!next) {
        setCurateStatus(`${sourceName} için kullanılabilir başka haber yok.`);
        return;
      }
      setCurateStatus(null);
      setItems((prev) => prev.map((it, i) => (i === index ? candidateToPickedDraft(next) : it)));
    },
    [candData, items],
  );

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
          ...(topicSlug ? { topicSlug } : {}),
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
                <div className={styles.itemHeadActions}>
                  {/* LLM-free: fill this slot from a chosen source's top unused article. */}
                  <select
                    className={styles.slotSourceSelect}
                    value=""
                    onChange={(e) => fillSlotFromSource(index, e.target.value)}
                    disabled={candLoading || candError !== null || !candData || candData.sources.length === 0}
                    aria-label={`Haber ${index + 1} için kaynaktan doldur`}
                  >
                    <option value="">
                      {candLoading
                        ? 'Yükleniyor…'
                        : candError
                          ? 'Kaynak yüklenemedi'
                          : 'Kaynaktan doldur…'}
                    </option>
                    {candData?.sources.map((g) => {
                      const available = g.items.filter((c) => !addedUrls.has(c.sourceUrl)).length;
                      return (
                        <option key={g.sourceName} value={g.sourceName} disabled={available === 0}>
                          {g.sourceName}
                          {available > 0 ? ` (${available})` : ' (—)'}
                        </option>
                      );
                    })}
                  </select>
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
        sources={candData?.sources ?? []}
        scannedAt={candData?.scannedAt ?? null}
        total={candData?.total ?? 0}
        loading={candLoading}
        error={candError}
        addedUrls={addedUrls}
        slotsFull={slotsFull}
        onPick={addDraft}
        onClose={() => setCuratorOpen(false)}
      />
    </form>
  );
}
