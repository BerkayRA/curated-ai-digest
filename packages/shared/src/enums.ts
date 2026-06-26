import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enum schemas — values MUST match Prisma enums exactly.
// ---------------------------------------------------------------------------

export const IssueStatusSchema = z.enum([
  'draft',
  'in_review',
  'approved',
  'scheduled',
  'sent',
  'failed',
  'cancelled',
]);
export type IssueStatus = z.infer<typeof IssueStatusSchema>;

export const ArticleStatusSchema = z.enum(['candidate', 'selected', 'rejected']);
export type ArticleStatus = z.infer<typeof ArticleStatusSchema>;

export const SendStatusSchema = z.enum(['queued', 'sent', 'delivered', 'bounced', 'failed']);
export type SendStatus = z.infer<typeof SendStatusSchema>;

export const EmailProviderKindSchema = z.enum(['microsoft_graph', 'acs_email', 'resend']);
export type EmailProviderKind = z.infer<typeof EmailProviderKindSchema>;

export const SubscriberStatusSchema = z.enum(['active', 'unsubscribed', 'bounced', 'pending']);
export type SubscriberStatus = z.infer<typeof SubscriberStatusSchema>;

// Consent mode for a topic: `business` (no public signup) or `public` (double opt-in).
export const ConsentModeSchema = z.enum(['business', 'public']);
export type ConsentMode = z.infer<typeof ConsentModeSchema>;

// Content language for a topic's curation output + email/archive copy.
export const LanguageSchema = z.enum(['tr', 'en']);
export type Language = z.infer<typeof LanguageSchema>;

// Recorded lawful basis for a SubscriberTopic membership (İYS-ready).
export const ConsentBasisSchema = z.enum([
  'business_relationship',
  'double_opt_in',
  'import',
  'single_opt_in',
]);
export type ConsentBasis = z.infer<typeof ConsentBasisSchema>;

// Monetization tier of a topic (Phase 6). `free` is the default; `premium` is a
// stored access marker only — billing is deferred (ADR-0012).
export const TopicTierSchema = z.enum(['free', 'premium']);
export type TopicTier = z.infer<typeof TopicTierSchema>;

// Kind of an IssueItem (Phase 6). `sponsored` slots are allowed only on public
// topics (enforced in the API layer) and rendered with a "Sponsorlu" label.
export const IssueItemKindSchema = z.enum(['editorial', 'sponsored']);
export type IssueItemKind = z.infer<typeof IssueItemKindSchema>;
