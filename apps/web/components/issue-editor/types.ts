/**
 * Shared types for the issue editor components.
 */

import type { IssueStatus } from '@digest/shared';

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
}
