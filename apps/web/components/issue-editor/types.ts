/**
 * Shared types for the issue editor components.
 */

import type { IssueStatus, AbStatusValue, IssueItemKind, ConsentMode } from '@digest/shared';

export interface AbVariantData {
  readonly variantIndex: number;
  readonly subject: string;
  readonly sentCount: number;
  readonly openCount: number;
}

/** An active sponsor offerable for a sponsored slot (from GET /api/sponsors). */
export interface SponsorOption {
  readonly id: string;
  readonly name: string;
}

export interface EditableItem {
  readonly id: string;
  readonly order: number;
  titleTr: string;
  summaryTr: string;
  sourceUrl: string;
  sourceName: string;
  /** Phase 6 — slot kind. A sponsored slot replaces an existing item slot. */
  kind: IssueItemKind;
  /** Phase 6 — references the chosen Sponsor when kind === 'sponsored'. */
  sponsorId: string | null;
  readonly factCheckNotes: string | null;
  readonly qaFlags: unknown;
}

export interface IssueEditorData {
  readonly id: string;
  readonly isoWeek: string;
  readonly status: IssueStatus;
  readonly subject: string;
  readonly preheader: string | null;
  readonly items: readonly EditableItem[];
  readonly abStatus: AbStatusValue;
  readonly abWinnerVariantIndex: number | null;
  readonly variants: readonly AbVariantData[];
  /**
   * The owning topic's consent mode. Sponsored slots are offered ONLY for
   * `public` topics; `business` topics never show a sponsored control.
   */
  readonly topicConsentMode: ConsentMode;
  /** The owning topic's monetization tier (carried for context). */
  readonly topicTier: 'free' | 'premium';
}
