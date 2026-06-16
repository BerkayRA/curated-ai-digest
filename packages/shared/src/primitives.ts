import { z } from 'zod';

// ---------------------------------------------------------------------------
// Reusable primitive schemas shared across DTOs.
// ---------------------------------------------------------------------------

/** RFC 5321-compliant e-mail address (lowercased after parse). */
export const emailSchema = z
  .string()
  .trim()
  .email('Invalid e-mail address')
  .transform((v) => v.toLowerCase());
export type Email = z.infer<typeof emailSchema>;

/** ISO week string — e.g. "2026-W24". */
export const isoWeekSchema = z
  .string()
  .regex(/^\d{4}-W\d{2}$/, 'isoWeek must match YYYY-Wnn (e.g. 2026-W24)');
export type IsoWeek = z.infer<typeof isoWeekSchema>;

/** "HH:mm" 24-hour time string. */
export const timeHHmmSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'sendTime must be HH:mm (24 h)');
export type TimeHHmm = z.infer<typeof timeHHmmSchema>;
