/**
 * Pure utility functions for the Sources dashboard page.
 * Kept in a separate module so they can be unit-tested without DOM / React.
 */

import type { SourceType } from '@digest/db';

// ---------------------------------------------------------------------------
// Relative time formatting (Turkish)
// ---------------------------------------------------------------------------

/**
 * Returns a Turkish relative-time string for a date, or "henüz taranmadı"
 * when the date is null.
 */
export function formatRelativeTime(date: Date | string | null): string {
  if (date === null) return 'henüz taranmadı';

  const ms = Date.now() - new Date(date).getTime();
  const seconds = Math.round(ms / 1_000);
  const minutes = Math.round(ms / 60_000);
  const hours = Math.round(ms / 3_600_000);
  const days = Math.round(ms / 86_400_000);

  if (seconds < 60) return `${seconds}sn önce`;
  if (minutes < 60) return `${minutes}dk önce`;
  if (hours < 24) return `${hours}sa önce`;
  return `${days}gün önce`;
}

// ---------------------------------------------------------------------------
// Health line copy
// ---------------------------------------------------------------------------

/**
 * Builds the full health-line string shown below each source card label.
 * Returns "henüz taranmadı" when lastRunAt is null.
 */
export function formatHealthLine(
  lastRunAt: Date | string | null,
  lastStatus: string | null,
  lastCount: number,
  lastError: string | null,
): string {
  if (lastRunAt === null) return 'henüz taranmadı';

  const relTime = formatRelativeTime(lastRunAt);
  let line = `son tarama: ${lastCount} aday · ${relTime}`;

  if (lastStatus === 'error' && lastError) {
    line += ` — ${lastError}`;
  }

  return line;
}

// ---------------------------------------------------------------------------
// Type badge
// ---------------------------------------------------------------------------

export interface SourceBadge {
  readonly emoji: string;
  readonly label: string;
}

const BADGE_MAP: Record<SourceType, SourceBadge> = {
  rss: { emoji: '📡', label: 'RSS' },
  radar: { emoji: '🛰', label: 'Radar' },
  exa: { emoji: '🔎', label: 'Exa' },
};

/** Returns the emoji + label pair for a given source type. */
export function sourceBadge(type: SourceType): SourceBadge {
  return BADGE_MAP[type];
}

// ---------------------------------------------------------------------------
// Type-driven field visibility for the add/edit panel
// ---------------------------------------------------------------------------

export interface FieldVisibility {
  readonly showUrl: boolean;
  readonly showRadar: boolean;
  readonly showExa: boolean;
}

/**
 * Given a source type, returns which sections of the slide-over form should
 * be visible.
 *   rss   → URL ✓ | Radar ✗ | Exa ✗
 *   radar → URL ✓ | Radar ✓ | Exa ✗
 *   exa   → URL ✗ | Radar ✗ | Exa ✓
 */
export function typeFieldsVisible(type: SourceType): FieldVisibility {
  return {
    showUrl: type !== 'exa',
    showRadar: type === 'radar',
    showExa: type === 'exa',
  };
}
