/**
 * i18n — zero-dependency string table for the digest email + archive structural copy.
 *
 * Only STRUCTURAL copy lives here (eyebrows, labels, CTA text, footer taglines,
 * unsubscribe prompts, archive chrome). Editorial content (titles, summaries) is
 * already localized upstream by the curation pipeline and is passed in as data.
 *
 * Default language is 'tr' — the TR values MUST match the strings that were
 * previously hardcoded in DigestEmail.tsx so default output stays byte-identical.
 */

export type EmailLang = 'tr' | 'en';

export interface EmailStrings {
  readonly eyebrow: string;
  readonly sourceLabel: string;
  readonly readMore: string;
  readonly footerTagline: string;
  readonly unsubscribePrompt: string;
  readonly unsubscribeLink: string;
  readonly archiveEyebrow: string;
  readonly archiveReadIssue: string;
  readonly archiveEmpty: string;
  readonly archiveBackToList: string;
}

export const strings: Record<EmailLang, EmailStrings> = {
  tr: {
    eyebrow: 'Haftalık YZ Digest',
    sourceLabel: 'Kaynak ·',
    readMore: 'Devamını oku →',
    footerTagline: 'Yapay zeka dünyasından haftalık seçkiler.',
    unsubscribePrompt: 'Bu e-postayı almak istemiyorsanız',
    unsubscribeLink: 'aboneliğinizi iptal edebilirsiniz',
    archiveEyebrow: 'ARŞİV',
    archiveReadIssue: 'Sayıyı oku',
    archiveEmpty: 'Henüz gönderilmiş sayı yok.',
    archiveBackToList: '← Tüm sayılar',
  },
  en: {
    eyebrow: 'Weekly AI Digest',
    sourceLabel: 'Source ·',
    readMore: 'Read more →',
    footerTagline: 'Weekly curated picks from the world of AI.',
    unsubscribePrompt: 'If you no longer wish to receive this email',
    unsubscribeLink: 'you can unsubscribe',
    archiveEyebrow: 'ARCHIVE',
    archiveReadIssue: 'Read issue',
    archiveEmpty: 'No issues sent yet.',
    archiveBackToList: '← All issues',
  },
};

/** Resolves the string table for a language, defaulting to Turkish. */
export function getStrings(lang?: EmailLang): EmailStrings {
  return lang === 'en' ? strings.en : strings.tr;
}
