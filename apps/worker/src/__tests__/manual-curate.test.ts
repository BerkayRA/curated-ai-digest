/**
 * manual-curate.ts — unit tests for the selection schema and helpers.
 *
 * These tests exercise exported pure functions only — no DB, no CLI side effects.
 */

import { describe, it, expect } from 'vitest';
import {
  selectionSchema,
  resolveIsoWeek,
} from '../manual-curate';

// ---------------------------------------------------------------------------
// selectionSchema — valid inputs
// ---------------------------------------------------------------------------

describe('selectionSchema — valid inputs', () => {
  const minimalItem = {
    titleTr: 'Samsung ve OpenAI ortaklık kurdu',
    summaryTr: 'Samsung, OpenAI ile çip ve AI asistan entegrasyonu için stratejik ortaklık imzaladı.',
    sourceUrl: 'https://techcrunch.com/2026/samsung-openai',
    sourceName: 'TechCrunch',
  };

  it('accepts a 2-item selection without isoWeek', () => {
    const input = {
      subject: 'AI Digest: Samsung×OpenAI & Gemma 4',
      preheader: 'Bu hafta yapay zekada öne çıkanlar',
      items: [minimalItem, { ...minimalItem, titleTr: 'Google Gemma 4 yayınlandı', sourceUrl: 'https://deepmind.google/gemma4' }],
    };
    const result = selectionSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('accepts a 3-item selection with valid isoWeek', () => {
    const input = {
      subject: 'AI Digest #25',
      preheader: 'Üç büyük gelişme',
      isoWeek: '2026-W25',
      items: [
        minimalItem,
        { ...minimalItem, titleTr: 'Google Gemma 4', sourceUrl: 'https://deepmind.google/gemma4' },
        { ...minimalItem, titleTr: 'Anthropic Cowork', sourceUrl: 'https://venturebeat.com/anthropic-cowork' },
      ],
    };
    const result = selectionSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('accepts isoWeek in different valid formats', () => {
    const base = {
      subject: 'Digest',
      preheader: 'Preheader text',
      items: [minimalItem, { ...minimalItem, sourceUrl: 'https://example.com/b' }],
    };
    expect(selectionSchema.safeParse({ ...base, isoWeek: '2025-W01' }).success).toBe(true);
    expect(selectionSchema.safeParse({ ...base, isoWeek: '2030-W52' }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// selectionSchema — invalid inputs
// ---------------------------------------------------------------------------

describe('selectionSchema — invalid inputs', () => {
  const validItem = {
    titleTr: 'Başlık',
    summaryTr: 'Özet metni burada.',
    sourceUrl: 'https://example.com/article',
    sourceName: 'Example',
  };

  const validBase = {
    subject: 'Geçerli konu',
    preheader: 'Geçerli ön başlık',
  };

  it('rejects fewer than 2 items (0 items)', () => {
    const result = selectionSchema.safeParse({ ...validBase, items: [] });
    expect(result.success).toBe(false);
  });

  it('rejects fewer than 2 items (1 item)', () => {
    const result = selectionSchema.safeParse({ ...validBase, items: [validItem] });
    expect(result.success).toBe(false);
  });

  it('rejects more than 3 items (4 items)', () => {
    const result = selectionSchema.safeParse({
      ...validBase,
      items: [validItem, validItem, validItem, validItem],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-URL sourceUrl', () => {
    const badItem = { ...validItem, sourceUrl: 'not-a-url' };
    const result = selectionSchema.safeParse({ ...validBase, items: [badItem, validItem] });
    expect(result.success).toBe(false);
  });

  it('rejects an empty titleTr', () => {
    const badItem = { ...validItem, titleTr: '' };
    const result = selectionSchema.safeParse({ ...validBase, items: [badItem, validItem] });
    expect(result.success).toBe(false);
  });

  it('rejects an empty summaryTr', () => {
    const badItem = { ...validItem, summaryTr: '' };
    const result = selectionSchema.safeParse({ ...validBase, items: [badItem, validItem] });
    expect(result.success).toBe(false);
  });

  it('rejects an empty subject', () => {
    const result = selectionSchema.safeParse({
      subject: '',
      preheader: 'valid',
      items: [validItem, validItem],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty preheader', () => {
    const result = selectionSchema.safeParse({
      subject: 'valid',
      preheader: '',
      items: [validItem, validItem],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a bad isoWeek format (no W prefix)', () => {
    const result = selectionSchema.safeParse({
      ...validBase,
      isoWeek: '2026-25',
      items: [validItem, validItem],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a bad isoWeek format (wrong separator)', () => {
    const result = selectionSchema.safeParse({
      ...validBase,
      isoWeek: '2026W25',
      items: [validItem, validItem],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty sourceName', () => {
    const badItem = { ...validItem, sourceName: '' };
    const result = selectionSchema.safeParse({ ...validBase, items: [badItem, validItem] });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveIsoWeek helper
// ---------------------------------------------------------------------------

describe('resolveIsoWeek', () => {
  it('returns the provided isoWeek when given', () => {
    expect(resolveIsoWeek('2026-W25')).toBe('2026-W25');
  });

  it('returns the provided isoWeek when different week', () => {
    expect(resolveIsoWeek('2025-W01')).toBe('2025-W01');
  });

  it('returns the current ISO week when given undefined', () => {
    const result = resolveIsoWeek(undefined);
    // Must match YYYY-Wnn format
    expect(result).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('the generated current week is plausible (year between 2020 and 2040)', () => {
    const result = resolveIsoWeek(undefined);
    const year = parseInt(result.slice(0, 4), 10);
    expect(year).toBeGreaterThanOrEqual(2020);
    expect(year).toBeLessThanOrEqual(2040);
  });

  it('the generated current week number is between 1 and 53', () => {
    const result = resolveIsoWeek(undefined);
    const weekNum = parseInt(result.slice(6), 10);
    expect(weekNum).toBeGreaterThanOrEqual(1);
    expect(weekNum).toBeLessThanOrEqual(53);
  });
});
