import { z } from 'zod';
import { isoWeekSchema } from '@digest/shared';

// ---------------------------------------------------------------------------
// Create-draft DTO — validated at the API boundary.
//
// Lives in its own module (not the route file) because Next.js Route Handlers
// only permit a fixed set of named exports (HTTP verbs + route config). The
// POST handler and the unit tests both import the schema from here.
//
// An issue carries 1..3 hand-authored items (the weekly digest format).
// ---------------------------------------------------------------------------

const CreateIssueItemDraftSchema = z.object({
  titleTr: z.string().trim().min(1, 'Haber başlığı gerekli'),
  summaryTr: z.string().trim().min(1, 'Haber özeti gerekli'),
  sourceUrl: z.string().trim().url('Geçerli bir kaynak URL gerekli'),
  sourceName: z.string().trim().min(1, 'Kaynak adı gerekli'),
  // Optional link back to the scanned CandidateArticle when the item was picked
  // via the LLM-free curator. Absent for hand-authored / file-pool items.
  candidateArticleId: z.string().cuid().optional(),
});

export const CreateIssueDraftSchema = z.object({
  isoWeek: isoWeekSchema,
  subject: z.string().trim().min(1, 'Konu başlığı gerekli'),
  preheader: z.string().trim().optional(),
  items: z
    .array(CreateIssueItemDraftSchema)
    .min(1, 'En az 1 haber gerekli')
    .max(3, 'En fazla 3 haber eklenebilir'),
});

export type CreateIssueDraftDto = z.infer<typeof CreateIssueDraftSchema>;
