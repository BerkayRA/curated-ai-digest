'use client';

import { useState } from 'react';
import type { Topic } from '@digest/db';
import type { ApiResponse } from '@/lib/api-response';
import { StatusPill } from '@/components/ui/StatusPill';
import styles from './topics.module.css';

// Reset the "copied" confirmation after this delay.
const COPY_RESET_MS = 2000;

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
  const [linkCopied, setLinkCopied] = useState(false);

  const isPaused = topic.status === 'paused';
  const isPublic = topic.consentMode === 'public';
  const isPremium = topic.tier === 'premium';
  const languageLabel = (topic.language ?? 'tr').toUpperCase();
  const brandColor = topic.brandColorHex;

  // ── Copy the public signup link ───────────────────────────

  const handleCopySignupLink = async () => {
    if (typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/s/${topic.slug}`);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), COPY_RESET_MS);
    } catch {
      setLinkCopied(false);
    }
  };

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
      {/* Card top: status pill + consent-mode badge */}
      <div className={styles.cardTop}>
        <StatusPill
          tone={isPaused ? 'watch' : 'adopt'}
          label={isPaused ? 'Duraklatıldı' : 'Etkin'}
        />
        <span
          className={`${styles.consentBadge} ${isPublic ? styles.consentPublic : ''}`}
          title={isPublic ? 'Herkese açık çift onaylı kayıt' : 'Kapalı iş ilişkisi listesi'}
        >
          {isPublic ? 'Herkese Açık' : 'İş İlişkisi'}
        </span>
        {isPremium && (
          <span className={styles.premiumBadge} title="Premium katman konusu">
            Premium
          </span>
        )}
        <span className={styles.languageBadge} title={`İçerik dili: ${languageLabel}`}>
          {brandColor && (
            <span
              className={styles.brandSwatch}
              style={{ backgroundColor: brandColor, marginRight: 6 }}
              aria-hidden="true"
            />
          )}
          {languageLabel}
        </span>
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

      {/* Public signup link copy affordance */}
      {isPublic && (
        <div className={styles.cardConsent}>
          <button type="button" className={styles.cardBtn} onClick={handleCopySignupLink}>
            {linkCopied ? 'Kopyalandı' : 'Kayıt bağlantısını kopyala'}
          </button>
        </div>
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
