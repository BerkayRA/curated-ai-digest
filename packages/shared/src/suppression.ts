import { z } from 'zod';

import { emailSchema } from './primitives';

// ---------------------------------------------------------------------------
// Global suppression list — values MUST match the Prisma SuppressionReason enum.
// ---------------------------------------------------------------------------

export const SuppressionReasonSchema = z.enum([
  'hard_bounce',
  'soft_bounce_threshold', // reserved — not yet written by any path (future count-then-suppress)
  'complaint',
  'manual',
]);
export type SuppressionReasonValue = z.infer<typeof SuppressionReasonSchema>;

/** Manual admin suppression entry. */
export const CreateSuppressionSchema = z.object({
  email: emailSchema,
});
export type CreateSuppressionDto = z.infer<typeof CreateSuppressionSchema>;

/** A suppression row as surfaced to the admin UI. */
export const SuppressionRowSchema = z.object({
  id: z.string(),
  email: emailSchema,
  reason: SuppressionReasonSchema,
  source: z.string(),
  bounceCount: z.number().int(),
  createdAt: z.coerce.date(),
});
export type SuppressionRow = z.infer<typeof SuppressionRowSchema>;
