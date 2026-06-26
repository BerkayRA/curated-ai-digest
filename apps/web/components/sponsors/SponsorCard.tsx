'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Sponsor } from '@digest/db';
import type { ApiResponse } from '@/lib/api-response';
import { StatusPill } from '@/components/ui/StatusPill';
import styles from './sponsors.module.css';

/** Render-boundary guard: only show an https logo (validated https on write too). */
function safeLogo(url: string | null): string | null {
  return url && /^https:\/\//i.test(url) ? url : null;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SponsorCardProps {
  sponsor: Sponsor;
  onEdit: (sponsor: Sponsor) => void;
  onToggled: (updated: Sponsor) => void;
}

// ---------------------------------------------------------------------------
// SponsorCard — presentational sponsor card with edit + activate/deactivate
// actions plus a link to the per-sponsor analytics page. Sponsors are never
// deleted (DELETE → 405); they are deactivated instead.
// ---------------------------------------------------------------------------

export function SponsorCard({ sponsor, onEdit, onToggled }: SponsorCardProps) {
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const isInactive = !sponsor.active;

  // ── Activate ↔ deactivate via PATCH { active } ────────────

  const handleToggleActive = async () => {
    if (toggling) return;
    setToggling(true);
    setToggleError(null);
    try {
      const res = await fetch(`/api/sponsors/${sponsor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ active: isInactive }),
      });
      const json = (await res.json()) as ApiResponse<Sponsor>;
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

  let hostname = sponsor.websiteUrl;
  try {
    hostname = new URL(sponsor.websiteUrl).hostname.replace(/^www\./, '');
  } catch {
    // keep raw value when URL parsing fails
  }

  return (
    <li
      className={`${styles.sponsorCard} ${isInactive ? styles.isInactive : ''}`}
      aria-label={sponsor.name}
    >
      {/* Card top: status pill + logo */}
      <div className={styles.cardTop}>
        <StatusPill tone={isInactive ? 'watch' : 'adopt'} label={isInactive ? 'Pasif' : 'Etkin'} />
        {safeLogo(sponsor.logoUrl) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={styles.cardLogo}
            src={safeLogo(sponsor.logoUrl)!}
            alt={`${sponsor.name} logosu`}
            width={72}
            height={28}
            loading="lazy"
          />
        )}
      </div>

      {/* Card identity */}
      <div className={styles.cardId}>
        <div className={styles.cardName}>{sponsor.name}</div>
        <a
          className={styles.cardLink}
          href={sponsor.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={sponsor.websiteUrl}
        >
          {hostname}
        </a>
      </div>

      {/* Contact + notes */}
      {sponsor.contactEmail && (
        <p className={styles.cardMeta}>
          <span className={styles.cardMetaLabel}>İletişim</span>
          <span className={styles.cardMetaValue}>{sponsor.contactEmail}</span>
        </p>
      )}

      {sponsor.notes && <p className={styles.cardNotes}>{sponsor.notes}</p>}

      {/* Toggle error */}
      {toggleError !== null && (
        <p className={styles.cardError} role="alert">
          {toggleError}
        </p>
      )}

      {/* Card actions */}
      <div className={styles.cardActions}>
        <button type="button" className={styles.cardBtn} onClick={() => onEdit(sponsor)}>
          Düzenle
        </button>

        <Link
          className={styles.cardBtn}
          href={`/sponsors/${sponsor.id}/analytics`}
          aria-label={`${sponsor.name} performansını görüntüle`}
        >
          Performans
        </Link>

        <span className={styles.cardActionsGrow} aria-hidden="true" />

        <button
          type="button"
          className={styles.cardBtn}
          onClick={handleToggleActive}
          disabled={toggling}
          aria-busy={toggling}
          aria-label={`${sponsor.name} sponsorunu ${isInactive ? 'etkinleştir' : 'pasifleştir'}`}
        >
          {toggling ? '…' : isInactive ? 'Etkinleştir' : 'Pasifleştir'}
        </button>
      </div>
    </li>
  );
}
