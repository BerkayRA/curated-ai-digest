/**
 * monetization.ts — pure, DB-free guards for Phase 6 sponsored slots.
 *
 * The hard rule: a sponsored IssueItem is allowed ONLY on a `public` topic, and
 * must reference a known active sponsor. Enforced at the API layer (this helper)
 * in addition to the UI hiding the control on business topics.
 */

import type { ConsentMode } from '@digest/shared';

/** Minimal shape of an item we need to validate for sponsorship. */
export interface SponsorableItem {
  readonly kind?: 'editorial' | 'sponsored';
  readonly sponsorId?: string | null;
}

export type SponsoredGateResult = { ok: true } | { ok: false; message: string };

/**
 * Validates sponsored items against the owning topic's consent mode and the set
 * of active sponsor ids. Pure — no I/O — so callers fetch the sponsor ids and
 * pass them in. Returns the first violation (if any) with a Turkish message.
 */
export function checkSponsoredItems(
  consentMode: ConsentMode,
  items: readonly SponsorableItem[],
  activeSponsorIds: ReadonlySet<string>,
): SponsoredGateResult {
  const sponsored = items.filter((it) => it.kind === 'sponsored');
  if (sponsored.length === 0) {
    return { ok: true };
  }

  if (consentMode !== 'public') {
    return {
      ok: false,
      message: 'Sponsorlu içerik yalnızca herkese açık (public) konularda kullanılabilir.',
    };
  }

  for (const it of sponsored) {
    if (!it.sponsorId) {
      return { ok: false, message: 'Sponsorlu slot için bir sponsor seçilmelidir.' };
    }
    if (!activeSponsorIds.has(it.sponsorId)) {
      return { ok: false, message: 'Seçilen sponsor bulunamadı veya aktif değil.' };
    }
  }

  return { ok: true };
}
