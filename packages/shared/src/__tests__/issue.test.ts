import { describe, it, expect } from 'vitest';
import { CreateIssueSchema, UpdateIssueSchema, CreateIssueItemSchema } from '../issue.js';

describe('CreateIssueSchema', () => {
  it('parses a valid create payload', () => {
    const result = CreateIssueSchema.parse({
      isoWeek: '2026-W24',
      subject: 'Bu Haftanın AI Haberleri',
    });
    expect(result.isoWeek).toBe('2026-W24');
    expect(result.subject).toBe('Bu Haftanın AI Haberleri');
  });

  it('accepts an optional preheader', () => {
    const result = CreateIssueSchema.parse({
      isoWeek: '2026-W01',
      subject: 'Deneme',
      preheader: 'Kısa özet',
    });
    expect(result.preheader).toBe('Kısa özet');
  });

  it('rejects an invalid isoWeek format', () => {
    expect(() =>
      CreateIssueSchema.parse({ isoWeek: '2026-06-16', subject: 'Test' }),
    ).toThrow();
  });

  it('rejects an empty subject', () => {
    expect(() =>
      CreateIssueSchema.parse({ isoWeek: '2026-W24', subject: '' }),
    ).toThrow();
  });
});

describe('UpdateIssueSchema', () => {
  it('accepts a partial update with only status', () => {
    const result = UpdateIssueSchema.parse({ status: 'in_review' });
    expect(result.status).toBe('in_review');
  });

  it('accepts a scheduledAt as a date string', () => {
    const result = UpdateIssueSchema.parse({ scheduledAt: '2026-06-19T09:00:00.000Z' });
    expect(result.scheduledAt).toBeInstanceOf(Date);
  });

  it('rejects an invalid status value', () => {
    expect(() => UpdateIssueSchema.parse({ status: 'archived' })).toThrow();
  });

  it('accepts an empty object (all fields optional)', () => {
    expect(() => UpdateIssueSchema.parse({})).not.toThrow();
  });
});

describe('CreateIssueItemSchema', () => {
  const validBase = {
    issueId: 'clxyz1234567890abcdefghij',
    order: 0,
    titleTr: 'OpenAI Yeni Model Yayınladı',
    summaryTr: 'OpenAI, daha güçlü bir model sundu.',
    sourceUrl: 'https://openai.com/blog/new-model',
    sourceName: 'OpenAI Blog',
  };

  it('parses a valid IssueItem', () => {
    const result = CreateIssueItemSchema.parse(validBase);
    expect(result.order).toBe(0);
    expect(result.sourceName).toBe('OpenAI Blog');
  });

  it('accepts order values 0, 1, 2', () => {
    for (const order of [0, 1, 2]) {
      expect(() => CreateIssueItemSchema.parse({ ...validBase, order })).not.toThrow();
    }
  });

  it('rejects order value 3 (out of bounds)', () => {
    expect(() => CreateIssueItemSchema.parse({ ...validBase, order: 3 })).toThrow();
  });

  it('rejects an invalid sourceUrl', () => {
    expect(() =>
      CreateIssueItemSchema.parse({ ...validBase, sourceUrl: 'not-a-url' }),
    ).toThrow();
  });

  it('rejects empty titleTr', () => {
    expect(() => CreateIssueItemSchema.parse({ ...validBase, titleTr: '' })).toThrow();
  });
});
