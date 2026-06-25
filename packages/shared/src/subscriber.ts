import { z } from 'zod';
import { SubscriberStatusSchema } from './enums.js';
import { emailSchema } from './primitives.js';
import { TopicSlugSchema } from './topic.js';

// ---------------------------------------------------------------------------
// Subscriber DTOs
// ---------------------------------------------------------------------------

export const CreateSubscriberSchema = z.object({
  email: emailSchema,
  displayName: z.string().min(1).optional(),
  company: z.string().min(1).optional(),
  locale: z.string().default('tr-TR'),
  source: z.enum(['manual', 'import']).default('manual'),
  /** Active topic slug — scopes the new subscriber's membership. */
  topicSlug: TopicSlugSchema.optional(),
});
export type CreateSubscriberDto = z.infer<typeof CreateSubscriberSchema>;

export const UpdateSubscriberSchema = z.object({
  displayName: z.string().min(1).optional(),
  company: z.string().min(1).optional(),
  status: SubscriberStatusSchema.optional(),
  locale: z.string().optional(),
});
export type UpdateSubscriberDto = z.infer<typeof UpdateSubscriberSchema>;

// ---------------------------------------------------------------------------
// CSV import row — used when bulk-importing subscribers
// ---------------------------------------------------------------------------

export const SubscriberImportRowSchema = z.object({
  email: emailSchema,
  displayName: z.string().trim().optional(),
  company: z.string().trim().optional(),
});
export type SubscriberImportRow = z.infer<typeof SubscriberImportRowSchema>;
