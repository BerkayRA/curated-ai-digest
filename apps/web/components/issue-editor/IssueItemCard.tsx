'use client';

/**
 * IssueItemCard — renders a single editable (or read-only) IssueItem.
 * Surfaces QA flags and fact-check notes prominently for human review.
 */

import type { EditableItem } from './types';
import styles from './editor.module.css';

interface IssueItemCardProps {
  item: EditableItem;
  index: number;
  totalItems: number;
  isEditable: boolean;
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
  onChange,
  onMoveUp,
  onMoveDown,
}: IssueItemCardProps) {
  const handleField = (field: keyof EditableItem, value: string) => {
    onChange({ ...item, [field]: value });
  };

  const cardId = `item-${item.id}`;

  return (
    <article className={styles.itemCard} aria-labelledby={`${cardId}-title`}>
      <div className={styles.itemCardHeader}>
        <span className={styles.itemOrder} aria-label={`Öğe ${index + 1}`}>
          {index + 1}
        </span>
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
      </div>
    </article>
  );
}
