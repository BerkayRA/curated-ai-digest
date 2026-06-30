import { z } from 'zod';
import { IssueItemKindSchema, IssueStatusSchema } from './enums';
import { httpUrlSchema, isoWeekSchema } from './primitives';

// ---------------------------------------------------------------------------
// Issue DTOs
// ---------------------------------------------------------------------------

export const CreateIssueSchema = z.object({
  isoWeek: isoWeekSchema,
  subject: z.string().min(1, 'Subject is required'),
  preheader: z.string().optional(),
});
export type CreateIssueDto = z.infer<typeof CreateIssueSchema>;

export const UpdateIssueSchema = z.object({
  subject: z.string().min(1).optional(),
  preheader: z.string().optional(),
  bodyHtml: z.string().optional(),
  bodyJson: z.unknown().optional(),
  scheduledAt: z.coerce.date().optional(),
  status: IssueStatusSchema.optional(),
});
export type UpdateIssueDto = z.infer<typeof UpdateIssueSchema>;

// ---------------------------------------------------------------------------
// IssueItem DTOs
// ---------------------------------------------------------------------------

export const CreateIssueItemSchema = z.object({
  issueId: z.string().cuid(),
  candidateArticleId: z.string().cuid().optional(),
  order: z.number().int().min(0).max(2),
  titleTr: z.string().min(1),
  summaryTr: z.string().min(1),
  // http(s) only — this URL is rendered as an <a href> in the public archive.
  sourceUrl: httpUrlSchema,
  sourceName: z.string().min(1),
  factCheckNotes: z.string().optional(),
  qaFlags: z.unknown().optional(),
  // Phase 6 — sponsored slots. Default editorial; a sponsored item carries a
  // sponsorId. The public-topic gate is enforced in the API layer, not here.
  kind: IssueItemKindSchema.default('editorial'),
  sponsorId: z.string().cuid().nullable().optional(),
});
export type CreateIssueItemDto = z.infer<typeof CreateIssueItemSchema>;

export const UpdateIssueItemSchema = CreateIssueItemSchema.omit({ issueId: true, order: true })
  .partial()
  .extend({ order: z.number().int().min(0).max(2).optional() });
export type UpdateIssueItemDto = z.infer<typeof UpdateIssueItemSchema>;
