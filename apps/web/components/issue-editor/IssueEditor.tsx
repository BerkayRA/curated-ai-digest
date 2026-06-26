'use client';

/**
 * IssueEditor — client component for editing draft/in_review issues.
 * Handles: field editing, item reordering, save, status transitions.
 */

import { useState, useCallback, useEffect, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { issueStatusLabel } from '@/components/ui/Badge';
import { EyebrowLabel } from '@/components/ui/EyebrowLabel';
import { StatusPill, issueStatusTone } from '@/components/ui/StatusPill';
import type { IssueStatus } from '@digest/shared';
import type { ApiResponse } from '@/lib/api-response';
import type { IssueEditorData, EditableItem, SponsorOption } from './types';
import { IssueItemCard } from './IssueItemCard';
import { PreviewPanel } from './PreviewPanel';
import { AbTestPanel } from './AbTestPanel';
import { ALLOWED_TRANSITIONS } from '@/lib/issue-status';
import styles from './editor.module.css';

interface IssueEditorProps {
  issue: IssueEditorData;
}

const STATUS_ACTION_LABELS: Partial<Record<IssueStatus, string>> = {
  in_review: 'İncelemeye Al',
  approved: 'Onayla',
  scheduled: 'Planla',
  sent: 'Gönder',
  cancelled: 'İptal Et',
};

const EDITABLE_STATUSES: IssueStatus[] = ['draft', 'in_review'];

export function IssueEditor({ issue }: IssueEditorProps) {
  const isEditable = EDITABLE_STATUSES.includes(issue.status);
  // Sponsored slots are offered ONLY on public topics. Business/B2B topics
  // never expose the sponsored control (and the API rejects them server-side).
  const sponsorsAllowed = issue.topicConsentMode === 'public';

  const [subject, setSubject] = useState(issue.subject);
  const [preheader, setPreheader] = useState(issue.preheader ?? '');
  const [items, setItems] = useState<EditableItem[]>(issue.items.map((item) => ({ ...item })));
  const [sponsors, setSponsors] = useState<readonly SponsorOption[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<IssueStatus>(issue.status);
  const [isPending, startTransition] = useTransition();

  // Load active sponsors for the sponsored-slot picker — public topics only.
  useEffect(() => {
    if (!sponsorsAllowed || !isEditable) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/sponsors', { credentials: 'same-origin' });
        const json = (await res.json()) as ApiResponse<SponsorOption[]>;
        if (!cancelled && json.success && json.data) {
          setSponsors(json.data.map((s) => ({ id: s.id, name: s.name })));
        }
      } catch {
        // Non-fatal: the picker simply has no options to offer.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sponsorsAllowed, isEditable]);

  const handleSave = useCallback(async () => {
    setSaveStatus('saving');
    setSaveError(null);

    try {
      const res = await fetch(`/api/issues/${issue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, preheader, items }),
      });
      const data: { success: boolean; error?: string } = await res.json();

      if (!data.success) {
        setSaveStatus('error');
        setSaveError(data.error ?? 'Kaydedilemedi');
        return;
      }

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
      setSaveError('Ağ hatası');
    }
  }, [issue.id, subject, preheader, items]);

  const handleTransition = useCallback(
    (to: IssueStatus) => {
      setTransitionError(null);

      startTransition(async () => {
        try {
          const res = await fetch(`/api/issues/${issue.id}/transition`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to }),
          });
          const data: { success: boolean; data?: { status: IssueStatus }; error?: string } =
            await res.json();

          if (!data.success) {
            setTransitionError(data.error ?? 'Durum değiştirilemedi');
            return;
          }

          if (data.data) {
            setCurrentStatus(data.data.status);
          }
        } catch {
          setTransitionError('Ağ hatası');
        }
      });
    },
    [issue.id],
  );

  const handleSendNow = useCallback(() => {
    setTransitionError(null);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/issues/${issue.id}/send`, { method: 'POST' });
        const data: { success: boolean; data?: { issueStatus: IssueStatus }; error?: string } =
          await res.json();

        if (!data.success) {
          setTransitionError(data.error ?? 'Gönderilemedi');
          return;
        }

        if (data.data) {
          setCurrentStatus(data.data.issueStatus);
        }
      } catch {
        setTransitionError('Ağ hatası');
      }
    });
  }, [issue.id]);

  const handleItemChange = useCallback((index: number, updated: EditableItem) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  }, []);

  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return;
    setItems((prev) => {
      const next = [...prev];
      const temp = next[index - 1]!;
      next[index - 1] = { ...next[index]!, order: index - 1 };
      next[index] = { ...temp, order: index };
      return next;
    });
  }, []);

  const handleMoveDown = useCallback((index: number) => {
    setItems((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      const temp = next[index + 1]!;
      next[index + 1] = { ...next[index]!, order: index + 1 };
      next[index] = { ...temp, order: index };
      return next;
    });
  }, []);

  const allowedNext = (ALLOWED_TRANSITIONS[currentStatus] ?? []) as IssueStatus[];
  const hasUnsavedChanges =
    subject !== issue.subject ||
    preheader !== (issue.preheader ?? '') ||
    items.some(
      (item, i) =>
        item.titleTr !== issue.items[i]?.titleTr ||
        item.summaryTr !== issue.items[i]?.summaryTr ||
        item.sourceUrl !== issue.items[i]?.sourceUrl ||
        item.sourceName !== issue.items[i]?.sourceName ||
        item.kind !== issue.items[i]?.kind ||
        item.sponsorId !== issue.items[i]?.sponsorId,
    );

  return (
    <div className={styles.layout}>
      {/* Left column — form */}
      <div className={styles.formCol}>
        {/* Header row */}
        <div className={styles.formHeader}>
          <div className={styles.statusRow}>
            <StatusPill
              tone={issueStatusTone(currentStatus)}
              label={issueStatusLabel(currentStatus)}
            />
            <span className={styles.isoWeek}>{issue.isoWeek}</span>
          </div>

          {isEditable && (
            <Button
              variant="primary"
              size="sm"
              loading={saveStatus === 'saving'}
              disabled={!hasUnsavedChanges}
              onClick={handleSave}
            >
              {saveStatus === 'saved' ? 'Kaydedildi' : 'Kaydet'}
            </Button>
          )}
        </div>

        {saveError && (
          <p className={styles.errorBanner} role="alert">
            {saveError}
          </p>
        )}
        {transitionError && (
          <p className={styles.errorBanner} role="alert">
            {transitionError}
          </p>
        )}

        {!isEditable && (
          <div className={styles.readOnlyBanner} role="status">
            Bu sayı <strong>{currentStatus}</strong> durumunda — düzenlenemez.
          </div>
        )}

        {/* Issue fields */}
        <section className={styles.section} aria-labelledby="issue-fields-heading">
          <div className={styles.sectionHead}>
            <EyebrowLabel as="span">Künye</EyebrowLabel>
            <h2 id="issue-fields-heading" className={styles.sectionTitle}>
              Sayı Bilgileri
            </h2>
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="subject" className={styles.label}>
              Konu Satırı
            </label>
            <input
              id="subject"
              className={styles.input}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={!isEditable}
              aria-required="true"
            />
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="preheader" className={styles.label}>
              Ön İzleme Metni
            </label>
            <input
              id="preheader"
              className={styles.input}
              value={preheader}
              onChange={(e) => setPreheader(e.target.value)}
              disabled={!isEditable}
              placeholder="E-posta istemcilerinde konu sonrası görünen kısa özet"
            />
          </div>
        </section>

        {/* Items */}
        <section className={styles.section} aria-labelledby="items-heading">
          <div className={styles.sectionHead}>
            <EyebrowLabel as="span">İçerik</EyebrowLabel>
            <h2 id="items-heading" className={styles.sectionTitle}>
              Haberler
            </h2>
          </div>
          <ol className={styles.itemList} aria-label="Haber öğeleri">
            {items.map((item, index) => (
              <li key={item.id}>
                <IssueItemCard
                  item={item}
                  index={index}
                  totalItems={items.length}
                  isEditable={isEditable}
                  sponsorsAllowed={sponsorsAllowed}
                  sponsors={sponsors}
                  onChange={(updated) => handleItemChange(index, updated)}
                  onMoveUp={() => handleMoveUp(index)}
                  onMoveDown={() => handleMoveDown(index)}
                />
              </li>
            ))}
          </ol>
        </section>

        {/* A/B subject-line test */}
        <AbTestPanel
          issueId={issue.id}
          status={currentStatus}
          abStatus={issue.abStatus}
          abWinnerVariantIndex={issue.abWinnerVariantIndex}
          initialVariants={issue.variants}
        />

        {/* Transition actions */}
        {allowedNext.length > 0 && (
          <section className={styles.section} aria-labelledby="actions-heading">
            <div className={styles.sectionHead}>
              <EyebrowLabel as="span">Durum geçişi</EyebrowLabel>
              <h2 id="actions-heading" className={styles.sectionTitle}>
                İşlemler
              </h2>
            </div>
            <div className={styles.actionRow}>
              {allowedNext.map((to) => {
                if (to === 'sent') {
                  return (
                    <Button
                      key={to}
                      variant="primary"
                      size="md"
                      loading={isPending}
                      onClick={handleSendNow}
                    >
                      Şimdi Gönder
                    </Button>
                  );
                }
                if (to === 'cancelled') {
                  return (
                    <Button
                      key={to}
                      variant="danger"
                      size="md"
                      loading={isPending}
                      onClick={() => handleTransition(to)}
                    >
                      {STATUS_ACTION_LABELS[to] ?? to}
                    </Button>
                  );
                }
                return (
                  <Button
                    key={to}
                    variant={to === 'approved' ? 'primary' : 'secondary'}
                    size="md"
                    loading={isPending}
                    onClick={() => handleTransition(to)}
                  >
                    {STATUS_ACTION_LABELS[to] ?? to}
                  </Button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Right column — live preview */}
      <div className={styles.previewCol}>
        <PreviewPanel
          issueId={issue.id}
          subject={subject}
          preheader={preheader}
          isoWeek={issue.isoWeek}
          items={items}
        />
      </div>
    </div>
  );
}
