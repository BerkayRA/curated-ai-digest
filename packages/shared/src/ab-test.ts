import { z } from 'zod';

// ---------------------------------------------------------------------------
// A/B subject-line testing — values MUST match the Prisma AbStatus enum.
// ---------------------------------------------------------------------------

export const AbStatusSchema = z.enum(['none', 'testing', 'selecting', 'completed']);
export type AbStatusValue = z.infer<typeof AbStatusSchema>;

/** A single subject variant authored on an issue. */
export const CreateSubjectVariantSchema = z.object({
  variantIndex: z.number().int().min(0).max(9),
  subject: z.string().min(1).max(200),
  // Share of the list that participates in the test group (per variant author).
  testFraction: z.number().min(0.05).max(0.5).default(0.5),
});
export type CreateSubjectVariantDto = z.infer<typeof CreateSubjectVariantSchema>;

/** Result of the winner-selection job. */
export const AbWinnerResultSchema = z.object({
  winnerVariantIndex: z.number().int(),
  winnerSubject: z.string(),
  remainderSentCount: z.number().int(),
});
export type AbWinnerResult = z.infer<typeof AbWinnerResultSchema>;
