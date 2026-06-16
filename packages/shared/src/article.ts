import { z } from 'zod';
import { ArticleStatusSchema } from './enums.js';

// ---------------------------------------------------------------------------
// CandidateArticle DTOs
// ---------------------------------------------------------------------------

export const CreateCandidateArticleSchema = z.object({
  sourceUrl: z.string().url(),
  sourceName: z.string().min(1),
  title: z.string().min(1),
  rawExcerpt: z.string().optional(),
  publishedAt: z.coerce.date().optional(),
  contentHash: z.string().min(1),
  importanceScore: z.number().min(0).max(1).optional(),
  relevanceScore: z.number().min(0).max(1).optional(),
  ingestRunId: z.string().cuid().optional(),
});
export type CreateCandidateArticleDto = z.infer<typeof CreateCandidateArticleSchema>;

export const UpdateCandidateArticleSchema = z.object({
  importanceScore: z.number().min(0).max(1).optional(),
  relevanceScore: z.number().min(0).max(1).optional(),
  status: ArticleStatusSchema.optional(),
});
export type UpdateCandidateArticleDto = z.infer<typeof UpdateCandidateArticleSchema>;
