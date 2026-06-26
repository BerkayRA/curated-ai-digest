'use client';

/**
 * IssueItemCard — renders a single editable (or read-only) IssueItem.
 * Surfaces QA flags and fact-check notes prominently for human review.
 */

import type { EditableItem, SponsorOption } from './types';
import styles from './editor.module.css';

// The admin editor UI is intentionally Turkish (subscriber-facing surfaces use
// the i18n string table instead); this badge label is a dashboard string.
const SPONSORED_BADGE_LABEL = 'Sponsorlu';

interface IssueItemCardProps {
  item: EditableItem;
  index: number;
  totalItems: number;
  isEditable: boolean;
  /** Whether sponsored slots may be offered (true only for public topics). */
  sponsorsAllowed: boolean;
  /** Active sponsors selectable when marking the slot sponsored. */
  sponsors: readonly SponsorOption[];
  onChange: (updated: EditableItem) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function QaFlagsPanel({ qaFlags }: { qaFlags: unknown }) {
  if (!qaFlags) return null;

  const flags = typeof qaFlags === 'object' && qaFlags !== null ? qaFlags : null;
  if (!flags) return null;

  const entries = Object.entries(flags as Record<string, unknown>).filter(
    ([, v]) => v !== null && v !== undefined && v !== false && v !== '',
  );

  if (entries.length === 0) return null;

  return (
    <div className={styles.qaPanel} role="status" aria-label="QA uyarıları">
      <span className={styles.qaPanelLabel}>QA Bayrakları</span>
      <ul className={styles.qaList}>
        {entries.map(([key, value]) => (
          <li key={key} className={styles.qaItem}>
            <strong>{key}:</strong> {String(value)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function IssueItemCard({
  item,
  index,
  totalItems,
  isEditable,
  sponsorsAllowed,
  sponsors,
  onChange,
  onMoveUp,
  onMoveDown,
}: IssueItemCardProps) {
  const handleField = (field: keyof EditableItem, value: string) => {
    onChange({ ...item, [field]: value });
  };

  const isSponsored = item.kind === 'sponsored';

  // Toggle the slot between editorial and sponsored. Clearing sponsorship also
  // clears the sponsorId; enabling it preselects the first active sponsor.
  const handleSponsoredToggle = (checked: boolean) => {
    if (checked) {
      onChange({
        ...item,
        kind: 'sponsored',
        sponsorId: item.sponsorId ?? sponsors[0]?.id ?? null,
      });
    } else {
      onChange({ ...item, kind: 'editorial', sponsorId: null });
    }
  };

  const cardId = `item-${item.id}`;

  return (
    <article className={styles.itemCard} aria-labelledby={`${cardId}-title`}>
      <div className={styles.itemCardHeader}>
        <span className={styles.itemOrder} aria-label={`Öğe ${index + 1}`}>
          {index + 1}
        </span>
        {isSponsored && <span className={styles.sponsoredBadge}>{SPONSORED_BADGE_LABEL}</span>}
        {isEditable && (
          <div className={styles.reorderButtons}>
            <button
              type="button"
              className={styles.reorderBtn}
              onClick={onMoveUp}
              disabled={index === 0}
              aria-label="Yukarı taşı"
              title="Yukarı taşı"
            >
              ↑
            </button>
            <button
              type="button"
              className={styles.reorderBtn}
              onClick={onMoveDown}
              disabled={index === totalItems - 1}
              aria-label="Aşağı taşı"
              title="Aşağı taşı"
            >
              ↓
            </button>
          </div>
        )}
      </div>

      {/* QA flags — prominent warning */}
      <QaFlagsPanel qaFlags={item.qaFlags} />

      {/* Fact-check notes */}
      {item.factCheckNotes && (
        <div className={styles.factCheckPanel} role="note" aria-label="Gerçek kontrolü notları">
          <span className={styles.factCheckLabel}>Gerçek Kontrolü</span>
          <p className={styles.factCheckNotes}>{item.factCheckNotes}</p>
        </div>
      )}

      <div className={styles.itemFields}>
        <div className={styles.fieldGroup}>
          <label htmlFor={`${cardId}-title`} className={styles.label}>
            Başlık (TR)
          </label>
          <input
            id={`${cardId}-title`}
            className={styles.input}
            value={item.titleTr}
            onChange={(e) => handleField('titleTr', e.target.value)}
            disabled={!isEditable}
          />
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor={`${cardId}-summary`} className={styles.label}>
            Özet (TR)
          </label>
          <textarea
            id={`${cardId}-summary`}
            className={styles.textarea}
            value={item.summaryTr}
            onChange={(e) => handleField('summaryTr', e.target.value)}
            disabled={!isEditable}
            rows={4}
          />
        </div>

        <div className={styles.fieldRowGroup}>
          <div className={styles.fieldGroup}>
            <label htmlFor={`${cardId}-source-url`} className={styles.label}>
              Kaynak URL
            </label>
            <input
              id={`${cardId}-source-url`}
              className={styles.input}
              value={item.sourceUrl}
              onChange={(e) => handleField('sourceUrl', e.target.value)}
              disabled={!isEditable}
              type="url"
            />
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor={`${cardId}-source-name`} className={styles.label}>
              Kaynak Adı
            </label>
            <input
              id={`${cardId}-source-name`}
              className={styles.input}
              value={item.sourceName}
              onChange={(e) => handleField('sourceName', e.target.value)}
              disabled={!isEditable}
            />
          </div>
        </div>

        {/* Sponsored slot — offered only for public topics (the API also
            enforces this). A sponsored slot occupies this item position. */}
        {sponsorsAllowed && (
          <div className={styles.sponsorPanel}>
            <label className={styles.sponsorToggle}>
              <input
                type="checkbox"
                checked={isSponsored}
                onChange={(e) => handleSponsoredToggle(e.target.checked)}
                disabled={!isEditable}
              />
              <span>Bu slotu sponsorlu olarak işaretle</span>
            </label>

            {isSponsored && (
              <div className={styles.fieldGroup}>
                <label htmlFor={`${cardId}-sponsor`} className={styles.label}>
                  Sponsor
                </label>
                <select
                  id={`${cardId}-sponsor`}
                  className={styles.input}
                  value={item.sponsorId ?? ''}
                  onChange={(e) => onChange({ ...item, sponsorId: e.target.value || null })}
                  disabled={!isEditable}
                >
                  <option value="" disabled>
                    Sponsor seçin
                  </option>
                  {sponsors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {sponsors.length === 0 && (
                  <p className={styles.sponsorHint}>
                    Aktif sponsor yok — önce Sponsorlar sayfasından ekleyin.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
