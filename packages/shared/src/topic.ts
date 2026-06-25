import { z } from 'zod';

import { ConsentModeSchema } from './enums.js';

// ---------------------------------------------------------------------------
// Topic status enum — values MUST match the Prisma TopicStatus enum exactly.
// ---------------------------------------------------------------------------

export const TopicStatusSchema = z.enum(['active', 'paused']);
export type TopicStatusValue = z.infer<typeof TopicStatusSchema>;

// ---------------------------------------------------------------------------
// Default topic slug — the seed newsletter. Single source of truth shared by
// the db default-topic resolver and the dashboard topic switcher.
// ---------------------------------------------------------------------------

export const DEFAULT_TOPIC_SLUG = 'enterprise-ai';

// ---------------------------------------------------------------------------
// Slug — lowercase, digits, and hyphens only (used in URLs + file-pool paths).
// Exported so any surface that accepts a topic slug validates it identically.
// ---------------------------------------------------------------------------

export const TopicSlugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug yalnızca küçük harf, rakam ve tireden oluşabilir.',
  });

// ---------------------------------------------------------------------------
// CreateTopicSchema — Phase 1b exposes the editorial fields only; schedule and
// branding columns exist on the model but are managed in Phase 1c.
// ---------------------------------------------------------------------------

export const CreateTopicSchema = z.object({
  slug: TopicSlugSchema,
  name: z.string().min(1).max(120),
  // nullable + optional so the form may submit cleared fields as null on create
  // (matching the update path) without tripping validation.
  description: z.string().max(2000).nullable().optional(),
  /** Audience descriptor injected into rank/curate/QA prompts. */
  audience: z.string().max(2000).nullable().optional(),
  /** Voice/tone descriptor injected into copywrite/QA prompts. */
  voice: z.string().max(2000).nullable().optional(),
  status: TopicStatusSchema.default('active'),
  // Default `business`: opening a public signup page is an explicit choice.
  consentMode: ConsentModeSchema.default('business'),
});
export type CreateTopicDto = z.infer<typeof CreateTopicSchema>;

// ---------------------------------------------------------------------------
// UpdateTopicSchema — all fields optional for partial updates.
// ---------------------------------------------------------------------------

export const UpdateTopicSchema = z.object({
  slug: TopicSlugSchema.optional(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  audience: z.string().max(2000).nullable().optional(),
  voice: z.string().max(2000).nullable().optional(),
  status: TopicStatusSchema.optional(),
  consentMode: ConsentModeSchema.optional(),
});
export type UpdateTopicDto = z.infer<typeof UpdateTopicSchema>;
