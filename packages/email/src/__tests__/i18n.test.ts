import { describe, it, expect } from 'vitest';
import { strings, getStrings, type EmailStrings } from '../i18n';

describe('email i18n', () => {
  const keys: Array<keyof EmailStrings> = [
    'eyebrow',
    'sourceLabel',
    'readMore',
    'footerTagline',
    'unsubscribePrompt',
    'unsubscribeLink',
    'archiveEyebrow',
    'archiveReadIssue',
    'archiveEmpty',
    'archiveBackToList',
  ];

  it('defines every key in both tr and en with non-empty values', () => {
    for (const key of keys) {
      expect(strings.tr[key].length).toBeGreaterThan(0);
      expect(strings.en[key].length).toBeGreaterThan(0);
    }
  });

  it('tr values match the previously hardcoded template copy', () => {
    expect(strings.tr.eyebrow).toBe('Haftalık YZ Digest');
    expect(strings.tr.readMore).toBe('Devamını oku →');
    expect(strings.tr.sourceLabel).toBe('Kaynak ·');
  });

  it('en values are the English equivalents', () => {
    expect(strings.en.eyebrow).toBe('Weekly AI Digest');
    expect(strings.en.readMore).toBe('Read more →');
  });

  it('getStrings defaults to tr when language is omitted or unknown', () => {
    expect(getStrings()).toBe(strings.tr);
    expect(getStrings('tr')).toBe(strings.tr);
    expect(getStrings('en')).toBe(strings.en);
  });
});
