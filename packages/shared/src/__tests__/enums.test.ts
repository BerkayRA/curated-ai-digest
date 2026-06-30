import { describe, it, expect } from 'vitest';
import {
  IssueStatusSchema,
  ArticleStatusSchema,
  SendStatusSchema,
  EmailProviderKindSchema,
  SubscriberStatusSchema,
} from '../enums';

describe('IssueStatusSchema', () => {
  const validValues = ['draft', 'in_review', 'approved', 'scheduled', 'sent', 'failed', 'cancelled'] as const;

  it.each(validValues)('accepts valid value "%s"', (value) => {
    expect(IssueStatusSchema.parse(value)).toBe(value);
  });

  it('rejects an unknown status', () => {
    expect(() => IssueStatusSchema.parse('published')).toThrow();
  });

  it('rejects empty string', () => {
    expect(() => IssueStatusSchema.parse('')).toThrow();
  });
});

describe('ArticleStatusSchema', () => {
  it.each(['candidate', 'selected', 'rejected'] as const)('accepts "%s"', (v) => {
    expect(ArticleStatusSchema.parse(v)).toBe(v);
  });

  it('rejects unknown value', () => {
    expect(() => ArticleStatusSchema.parse('pending')).toThrow();
  });
});

describe('SendStatusSchema', () => {
  it.each(['queued', 'sent', 'delivered', 'bounced', 'failed'] as const)('accepts "%s"', (v) => {
    expect(SendStatusSchema.parse(v)).toBe(v);
  });

  it('rejects unknown value', () => {
    expect(() => SendStatusSchema.parse('processing')).toThrow();
  });
});

describe('EmailProviderKindSchema', () => {
  it.each(['microsoft_graph', 'acs_email', 'resend'] as const)('accepts "%s"', (v) => {
    expect(EmailProviderKindSchema.parse(v)).toBe(v);
  });

  it('rejects unknown provider', () => {
    expect(() => EmailProviderKindSchema.parse('sendgrid')).toThrow();
  });
});

describe('SubscriberStatusSchema', () => {
  it.each(['active', 'unsubscribed', 'bounced'] as const)('accepts "%s"', (v) => {
    expect(SubscriberStatusSchema.parse(v)).toBe(v);
  });

  it('rejects unknown value', () => {
    expect(() => SubscriberStatusSchema.parse('inactive')).toThrow();
  });
});
