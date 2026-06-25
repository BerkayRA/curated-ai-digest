/**
 * Shared types for the issue editor components.
 */

import type { IssueStatus, AbStatusValue } from '@digest/shared';

export interface AbVariantData {
  readonly variantIndex: number;
  readonly subject: string;
  readonly sentCount: number;
  readonly openCount: number;
}

export interface EditableItem {
  readonly id: string;
  readonly order: number;
  titleTr: string;
  summaryTr: string;
  sourceUrl: string;
  sourceName: string;
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
}
