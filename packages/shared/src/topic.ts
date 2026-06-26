import { z } from 'zod';

import { ConsentModeSchema, LanguageSchema, TopicTierSchema } from './enums.js';
import { HTTPS_URL_MESSAGE, isHttpsUrl } from './primitives.js';

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
  // Phase 6 — monetization tier. `free` default; `premium` is a stored marker.
  tier: TopicTierSchema.default('free'),
  // Phase 5 — white-label + language. Defaults preserve the Mega/TR look.
  language: LanguageSchema.default('tr'),
  brandLogoUrl: z
    .string()
    .url()
    .max(500)
    .refine(isHttpsUrl, { message: HTTPS_URL_MESSAGE })
    .nullable()
    .optional(),
  brandColorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Renk #RRGGBB biçiminde olmalı.')
    .nullable()
    .optional(),
  brandName: z.string().max(120).nullable().optional(),
  brandFooterText: z.string().max(500).nullable().optional(),
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
  tier: TopicTierSchema.optional(),
  language: LanguageSchema.optional(),
  brandLogoUrl: z
    .string()
    .url()
    .max(500)
    .refine(isHttpsUrl, { message: HTTPS_URL_MESSAGE })
    .nullable()
    .optional(),
  brandColorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Renk #RRGGBB biçiminde olmalı.')
    .nullable()
    .optional(),
  brandName: z.string().max(120).nullable().optional(),
  brandFooterText: z.string().max(500).nullable().optional(),
});
export type UpdateTopicDto = z.infer<typeof UpdateTopicSchema>;
