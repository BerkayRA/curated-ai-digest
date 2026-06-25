'use client';

import { useState } from 'react';
import type { Topic } from '@digest/db';
import type { ApiResponse } from '@/lib/api-response';
import { StatusPill } from '@/components/ui/StatusPill';
import styles from './topics.module.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TopicCardProps {
  topic: Topic;
  onEdit: (topic: Topic) => void;
  onToggled: (updated: Topic) => void;
}

// ---------------------------------------------------------------------------
// TopicCard — presentational topic card with edit + pause/activate actions.
// Topics are never deleted, so there is no delete button (DELETE → 405).
// ---------------------------------------------------------------------------

export function TopicCard({ topic, onEdit, onToggled }: TopicCardProps) {
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const isPaused = topic.status === 'paused';

  // ── Pause ↔ activate via PATCH { status } ─────────────────

  const handleToggleStatus = async () => {
    if (toggling) return;
    setToggling(true);
    setToggleError(null);
    try {
      const nextStatus = isPaused ? 'active' : 'paused';
      const res = await fetch(`/api/topics/${topic.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = (await res.json()) as ApiResponse<Topic>;
      if (!json.success || !json.data) {
        setToggleError(json.error ?? 'Durum güncellenemedi');
        return;
      }
      onToggled(json.data);
    } catch {
      setToggleError('Sunucuya bağlanırken bir hata oluştu');
    } finally {
      setToggling(false);
    }
  };

  return (
    <li
      className={`${styles.topicCard} ${isPaused ? styles.isPaused : ''}`}
      aria-label={topic.name}
    >
      {/* Card top: status pill */}
      <div className={styles.cardTop}>
        <StatusPill
          tone={isPaused ? 'watch' : 'adopt'}
          label={isPaused ? 'Duraklatıldı' : 'Etkin'}
        />
      </div>

      {/* Card identity */}
      <div className={styles.cardId}>
        <div className={styles.cardName}>{topic.name}</div>
        <span className={styles.cardSlug} title={topic.slug}>
          {topic.slug}
        </span>
      </div>

      {/* Description */}
      {topic.description && <p className={styles.cardDesc}>{topic.description}</p>}

      {/* Audience snippet */}
      {topic.audience && (
        <p className={styles.cardAudience}>
          <span className={styles.cardMetaLabel}>Kitle</span>
          <span className={styles.cardMetaValue}>{topic.audience}</span>
        </p>
      )}

      {/* Toggle error */}
      {toggleError !== null && (
        <p className={styles.cardError} role="alert">
          {toggleError}
        </p>
      )}

      {/* Card actions */}
      <div className={styles.cardActions}>
        <button type="button" className={styles.cardBtn} onClick={() => onEdit(topic)}>
          Düzenle
        </button>

        <span className={styles.cardActionsGrow} aria-hidden="true" />

        <button
          type="button"
          className={styles.cardBtn}
          onClick={handleToggleStatus}
          disabled={toggling}
          aria-busy={toggling}
          aria-label={`${topic.name} konusunu ${isPaused ? 'etkinleştir' : 'duraklat'}`}
        >
          {toggling ? '…' : isPaused ? 'Etkinleştir' : 'Duraklat'}
        </button>
      </div>
    </li>
  );
}
