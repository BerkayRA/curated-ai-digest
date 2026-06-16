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

export const SubscriberStatusSchema = z.enum(['active', 'unsubscribed', 'bounced']);
export type SubscriberStatus = z.infer<typeof SubscriberStatusSchema>;
