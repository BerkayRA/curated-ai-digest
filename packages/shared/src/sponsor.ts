import { z } from 'zod';

import { HTTPS_URL_MESSAGE, isHttpsUrl } from './primitives';

// ---------------------------------------------------------------------------
// Sponsor DTOs (Phase 6 — monetization).
//
// A sponsor is non-secret config referenced by sponsored IssueItems. URLs are
// https-only (they are rendered as <a href>/<img src> on the public archive and
// in emails), mirroring the topic white-label guards.
// ---------------------------------------------------------------------------

export const CreateSponsorSchema = z.object({
  name: z.string().min(1).max(120),
  websiteUrl: z.string().url().max(500).refine(isHttpsUrl, { message: HTTPS_URL_MESSAGE }),
  logoUrl: z
    .string()
    .url()
    .max(500)
    .refine(isHttpsUrl, { message: HTTPS_URL_MESSAGE })
    .nullable()
    .optional(),
  contactEmail: z.string().email().max(320).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  active: z.boolean().default(true),
});
export type CreateSponsorDto = z.infer<typeof CreateSponsorSchema>;

// All fields optional for partial updates; `name` keeps its non-empty rule.
export const UpdateSponsorSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  websiteUrl: z
    .string()
    .url()
    .max(500)
    .refine(isHttpsUrl, { message: HTTPS_URL_MESSAGE })
    .optional(),
  logoUrl: z
    .string()
    .url()
    .max(500)
    .refine(isHttpsUrl, { message: HTTPS_URL_MESSAGE })
    .nullable()
    .optional(),
  contactEmail: z.string().email().max(320).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  active: z.boolean().optional(),
});
export type UpdateSponsorDto = z.infer<typeof UpdateSponsorSchema>;
