/**
 * archive.ts — pure, DB-free helpers for the public per-topic web archive.
 *
 * The archive route handlers are thin server components; all branding/i18n/RSS
 * mapping logic lives here as side-effect-free functions so it can be unit
 * tested without Next.js or a database.
 *
 * Branding defaults intentionally mirror the email template (DigestEmail.tsx)
 * so a topic with no overrides renders the Mega / Process-Blue / TR look.
 */

import type { RssItem } from '@digest/shared';

// ---------------------------------------------------------------------------
// Branding resolution — defaults mirror packages/email/src/templates/DigestEmail.tsx
// ---------------------------------------------------------------------------

/** Default Process-Blue accent (matches the email BRAND token). */
export const DEFAULT_ACCENT_HEX = '#009FDA';
/** Default white Buka chameleon logo path (served from app/public/brand). */
export const DEFAULT_LOGO_PATH = '/brand/mega-logo-white.png';
/** Default wordmark (matches the email DEFAULT_BRAND_NAME). */
export const DEFAULT_BRAND_NAME = 'Curated AI Digest';
/** Default footer descriptor (matches the email DEFAULT_FOOTER_TEXT). */
export const DEFAULT_FOOTER_TEXT =
  'Curated AI Digest — Mega Bilgisayar Tic. Ltd. Şti’nin haftalık yapay zeka digesti.';

/** Strict #RRGGBB matcher — the only shape allowed into the inline CSS accent. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Returns the hex if it is a well-formed #RRGGBB color, else the default accent.
 * Defense-in-depth: brandColorHex is Zod-validated on write, but the archive is
 * public and this value is injected into an inline CSS custom property, so we
 * re-validate at the render boundary rather than trust the stored value.
 */
function safeAccentHex(hex: string | null | undefined): string {
  return hex && HEX_COLOR.test(hex) ? hex : DEFAULT_ACCENT_HEX;
}

/** https-only scheme guard for the topic logo `<img src>`. */
const HTTPS_URL = /^https:\/\//i;

/**
 * Returns the logo URL only if it is an https URL or a same-origin absolute path
 * (the bundled default), else the default logo. Defense-in-depth: brandLogoUrl
 * is validated https on write, but the archive is public and this value is an
 * `<img src>`, so we re-validate at the render boundary.
 */
function safeLogoUrl(url: string | null | undefined): string {
  if (!url) return DEFAULT_LOGO_PATH;
  if (url.startsWith('/')) return url; // bundled same-origin asset
  return HTTPS_URL.test(url) ? url : DEFAULT_LOGO_PATH;
}

/**
 * Returns the URL only if it is a safe http(s) link, else null. Article source
 * URLs are validated http(s) on write; this guards the public render boundary so
 * a legacy `javascript:`/`data:` value can never become a clickable archive link.
 */
export function safeHttpHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const proto = new URL(url).protocol;
    return proto === 'http:' || proto === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** The subset of Topic fields the archive needs for branding + language. */
export interface ArchiveTopicBranding {
  readonly brandLogoUrl?: string | null;
  readonly brandColorHex?: string | null;
  readonly brandName?: string | null;
  readonly brandFooterText?: string | null;
  readonly language?: string | null;
}

/** Resolved, non-null branding the archive components render directly. */
export interface ResolvedArchiveBranding {
  readonly logoUrl: string;
  readonly accentHex: string;
  readonly brandName: string;
  readonly footerText: string;
  readonly language: ArchiveLang;
  /** Intl locale derived from the language ('tr-TR' | 'en-US'). */
  readonly locale: string;
}

/**
 * Maps a topic's nullable branding columns to concrete archive render props,
 * falling back to the Mega / Process-Blue / TR defaults for any unset field.
 */
export function resolveArchiveBranding(topic: ArchiveTopicBranding): ResolvedArchiveBranding {
  const language: ArchiveLang = topic.language === 'en' ? 'en' : 'tr';
  return {
    logoUrl: safeLogoUrl(topic.brandLogoUrl),
    accentHex: safeAccentHex(topic.brandColorHex),
    brandName: topic.brandName ?? DEFAULT_BRAND_NAME,
    footerText: topic.brandFooterText ?? DEFAULT_FOOTER_TEXT,
    language,
    locale: language === 'en' ? 'en-US' : 'tr-TR',
  };
}

// ---------------------------------------------------------------------------
// i18n — structural archive chrome. Values match the email archive* keys so
// the two surfaces stay consistent. Kept local to avoid pulling the email
// renderer (react-dom/server) into the web bundle.
// ---------------------------------------------------------------------------

export type ArchiveLang = 'tr' | 'en';

export interface ArchiveStrings {
  readonly eyebrow: string;
  readonly readIssue: string;
  readonly empty: string;
  readonly backToList: string;
  readonly subscribeCta: string;
  readonly sponsoredLabel: string;
}

const STRINGS: Record<ArchiveLang, ArchiveStrings> = {
  tr: {
    eyebrow: 'ARŞİV',
    readIssue: 'Sayıyı oku',
    empty: 'Henüz gönderilmiş sayı yok.',
    backToList: '← Tüm sayılar',
    subscribeCta: 'Abone ol',
    sponsoredLabel: 'Sponsorlu',
  },
  en: {
    eyebrow: 'ARCHIVE',
    readIssue: 'Read issue',
    empty: 'No issues sent yet.',
    backToList: '← All issues',
    subscribeCta: 'Subscribe',
    sponsoredLabel: 'Sponsored',
  },
};

/** Resolves the archive string table for a language, defaulting to Turkish. */
export function getArchiveStrings(lang?: ArchiveLang): ArchiveStrings {
  return lang === 'en' ? STRINGS.en : STRINGS.tr;
}

// ---------------------------------------------------------------------------
// Date + RSS mapping
// ---------------------------------------------------------------------------

/** Formats an issue date for display in the resolved locale (long form). */
export function formatIssueDate(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** A sent issue, reduced to the fields the archive list + RSS feed render. */
export interface ArchiveIssue {
  readonly isoWeek: string;
  readonly subject: string;
  readonly preheader: string | null;
  /** Sent timestamp; falls back to createdAt when an older issue lacks sentAt. */
  readonly sentAt: Date;
}

/**
 * Builds the absolute permalink for a single archived issue.
 * `baseUrl` should have no trailing slash (e.g. https://digest.example.com).
 */
export function issuePermalink(baseUrl: string, topicSlug: string, isoWeek: string): string {
  return `${baseUrl}/archive/${encodeURIComponent(topicSlug)}/${encodeURIComponent(isoWeek)}`;
}

/** Maps sent issues to RSS items (newest first is the caller's responsibility). */
export function issuesToRssItems(
  baseUrl: string,
  topicSlug: string,
  issues: readonly ArchiveIssue[],
): RssItem[] {
  return issues.map((issue) => {
    const link = issuePermalink(baseUrl, topicSlug, issue.isoWeek);
    return {
      title: issue.subject,
      link,
      guid: link,
      description: issue.preheader ?? issue.subject,
      pubDate: issue.sentAt,
    };
  });
}
