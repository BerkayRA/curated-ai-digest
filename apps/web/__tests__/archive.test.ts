/**
 * Unit tests for the pure archive helpers (apps/web/lib/archive.ts).
 *
 * These cover branding fallback, language/locale resolution, archive i18n, and
 * RSS item mapping. No DB or Next.js — the helpers are side-effect-free.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveArchiveBranding,
  getArchiveStrings,
  formatIssueDate,
  issuePermalink,
  issuesToRssItems,
  safeHttpHref,
  DEFAULT_ACCENT_HEX,
  DEFAULT_LOGO_PATH,
  DEFAULT_BRAND_NAME,
  DEFAULT_FOOTER_TEXT,
  type ArchiveIssue,
} from '../lib/archive';

// ---------------------------------------------------------------------------
// resolveArchiveBranding — fallback to Mega / Process-Blue / TR defaults
// ---------------------------------------------------------------------------

describe('resolveArchiveBranding', () => {
  it('falls back to Mega/Process-Blue/TR defaults when all fields are null', () => {
    const b = resolveArchiveBranding({
      brandLogoUrl: null,
      brandColorHex: null,
      brandName: null,
      brandFooterText: null,
      language: null,
    });
    expect(b.logoUrl).toBe(DEFAULT_LOGO_PATH);
    expect(b.accentHex).toBe(DEFAULT_ACCENT_HEX);
    expect(b.brandName).toBe(DEFAULT_BRAND_NAME);
    expect(b.footerText).toBe(DEFAULT_FOOTER_TEXT);
    expect(b.language).toBe('tr');
    expect(b.locale).toBe('tr-TR');
  });

  it('falls back to defaults when fields are undefined (empty object)', () => {
    const b = resolveArchiveBranding({});
    expect(b.logoUrl).toBe(DEFAULT_LOGO_PATH);
    expect(b.brandName).toBe(DEFAULT_BRAND_NAME);
    expect(b.language).toBe('tr');
  });

  it('uses per-topic overrides when provided', () => {
    const b = resolveArchiveBranding({
      brandLogoUrl: 'https://cdn.example.com/logo.png',
      brandColorHex: '#E6007E',
      brandName: 'FinTech Weekly',
      brandFooterText: 'FinTech Weekly — markets, money, machines.',
      language: 'en',
    });
    expect(b.logoUrl).toBe('https://cdn.example.com/logo.png');
    expect(b.accentHex).toBe('#E6007E');
    expect(b.brandName).toBe('FinTech Weekly');
    expect(b.footerText).toBe('FinTech Weekly — markets, money, machines.');
    expect(b.language).toBe('en');
    expect(b.locale).toBe('en-US');
  });

  it('treats an unknown language as tr', () => {
    const b = resolveArchiveBranding({ language: 'de' });
    expect(b.language).toBe('tr');
    expect(b.locale).toBe('tr-TR');
  });

  it('rejects a malformed accent hex and falls back to the default (CSS-injection guard)', () => {
    for (const bad of ['red; } body{display:none', 'rgb(1,2,3)', '#ZZZ', '#12345', '']) {
      expect(resolveArchiveBranding({ brandColorHex: bad }).accentHex).toBe(DEFAULT_ACCENT_HEX);
    }
    // A valid hex still passes through.
    expect(resolveArchiveBranding({ brandColorHex: '#E6007E' }).accentHex).toBe('#E6007E');
  });

  it('rejects a non-https logo URL and falls back to the default logo', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:image/svg+xml,<svg/>',
      'http://cdn.example.com/logo.png', // http not allowed
      'ftp://example.com/logo.png',
    ]) {
      expect(resolveArchiveBranding({ brandLogoUrl: bad }).logoUrl).toBe(DEFAULT_LOGO_PATH);
    }
    // https + the bundled same-origin path both pass through.
    expect(resolveArchiveBranding({ brandLogoUrl: 'https://cdn.example.com/l.png' }).logoUrl).toBe(
      'https://cdn.example.com/l.png',
    );
    expect(resolveArchiveBranding({ brandLogoUrl: '/brand/custom.png' }).logoUrl).toBe(
      '/brand/custom.png',
    );
  });
});

// ---------------------------------------------------------------------------
// safeHttpHref — public-render boundary guard for article source links
// ---------------------------------------------------------------------------

describe('safeHttpHref', () => {
  it('passes through http(s) URLs', () => {
    expect(safeHttpHref('https://example.com/a')).toBe('https://example.com/a');
    expect(safeHttpHref('http://example.com/a')).toBe('http://example.com/a');
  });

  it('returns null for dangerous or malformed URLs', () => {
    expect(safeHttpHref('javascript:alert(1)')).toBeNull();
    expect(safeHttpHref('data:text/html,<script>1</script>')).toBeNull();
    expect(safeHttpHref('not a url')).toBeNull();
    expect(safeHttpHref('')).toBeNull();
    expect(safeHttpHref(null)).toBeNull();
    expect(safeHttpHref(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getArchiveStrings — structural i18n
// ---------------------------------------------------------------------------

describe('getArchiveStrings', () => {
  it('returns Turkish strings by default', () => {
    const t = getArchiveStrings();
    expect(t.eyebrow).toBe('ARŞİV');
    expect(t.empty).toBe('Henüz gönderilmiş sayı yok.');
  });

  it('returns English strings for en', () => {
    const t = getArchiveStrings('en');
    expect(t.eyebrow).toBe('ARCHIVE');
    expect(t.empty).toBe('No issues sent yet.');
  });
});

// ---------------------------------------------------------------------------
// formatIssueDate — locale-aware long date
// ---------------------------------------------------------------------------

describe('formatIssueDate', () => {
  const date = new Date('2026-06-16T10:00:00.000Z');

  it('formats in Turkish locale', () => {
    const out = formatIssueDate(date, 'tr-TR');
    expect(out).toContain('2026');
    expect(out).toContain('Haziran');
  });

  it('formats in English locale', () => {
    const out = formatIssueDate(date, 'en-US');
    expect(out).toContain('2026');
    expect(out).toContain('June');
  });
});

// ---------------------------------------------------------------------------
// issuePermalink + issuesToRssItems
// ---------------------------------------------------------------------------

describe('issuePermalink', () => {
  it('builds an absolute, URL-encoded permalink', () => {
    expect(issuePermalink('https://d.example.com', 'enterprise-ai', '2026-W24')).toBe(
      'https://d.example.com/archive/enterprise-ai/2026-W24',
    );
  });
});

describe('issuesToRssItems', () => {
  const issues: ArchiveIssue[] = [
    {
      isoWeek: '2026-W24',
      subject: 'Yapay Zeka Haftası',
      preheader: 'Bu hafta öne çıkanlar',
      sentAt: new Date('2026-06-16T10:00:00.000Z'),
    },
    {
      isoWeek: '2026-W23',
      subject: 'Önceki Hafta',
      preheader: null,
      sentAt: new Date('2026-06-09T10:00:00.000Z'),
    },
  ];

  it('maps issues to RSS items with absolute permalinks as link + guid', () => {
    const items = issuesToRssItems('https://d.example.com', 'enterprise-ai', issues);
    expect(items).toHaveLength(2);
    expect(items[0]!.title).toBe('Yapay Zeka Haftası');
    expect(items[0]!.link).toBe('https://d.example.com/archive/enterprise-ai/2026-W24');
    expect(items[0]!.guid).toBe(items[0]!.link);
    expect(items[0]!.description).toBe('Bu hafta öne çıkanlar');
    expect(items[0]!.pubDate).toEqual(new Date('2026-06-16T10:00:00.000Z'));
  });

  it('falls back to the subject when an issue has no preheader', () => {
    const items = issuesToRssItems('https://d.example.com', 'enterprise-ai', issues);
    expect(items[1]!.description).toBe('Önceki Hafta');
  });
});
