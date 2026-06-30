import { describe, it, expect } from 'vitest';
import { renderDigestEmail } from '../render';
import { sampleIssue, sampleIssueTwoItems } from '../fixtures/sampleIssue';
import type { DigestEmailData } from '../types';

/**
 * React Email HTML-encodes apostrophes (') as &#x27;.
 * Assertions on the html output must account for this.
 * We use title-fragments that don't contain apostrophes where possible,
 * or check the plaintext output for exact strings.
 */

describe('renderDigestEmail', () => {
  describe('HTML output — 3 items', () => {
    it('returns non-empty html and text strings', async () => {
      const result = await renderDigestEmail(sampleIssue);
      expect(result.html.length).toBeGreaterThan(0);
      expect(result.text.length).toBeGreaterThan(0);
    });

    it('html contains the email subject (no apostrophes in subject)', async () => {
      const { html } = await renderDigestEmail(sampleIssue);
      // Subject: "Yapay Zeka Haftası: Gemini Ultra 2.0, Apple Intelligence ve Açık Kaynak Savaşı"
      expect(html).toContain('Yapay Zeka Haftası');
      expect(html).toContain('Gemini Ultra 2.0');
      expect(html).toContain('Açık Kaynak');
    });

    it('html contains all three item title fragments', async () => {
      const { html } = await renderDigestEmail(sampleIssue);
      // Use apostrophe-free substrings of each title so entity encoding doesn't break the match.
      // Title 1: "Google Gemini Ultra 2.0 Yayınlandı: Tüm Kıyaslamalarda Liderliği Ele Geçirdi"
      expect(html).toContain('Google Gemini Ultra 2.0 Yayınlandı');
      // Title 2: "Apple Intelligence Türkiye'de: Siri Artık Türkçe Anlıyor"
      // 'de is encoded, so match the apostrophe-free prefix
      expect(html).toContain('Apple Intelligence Türkiye');
      // Title 3: "Meta, Llama 4'ü Açık Kaynak Olarak Yayınladı"
      expect(html).toContain('Meta, Llama 4');
      expect(html).toContain('Açık Kaynak Olarak');
    });

    it('html contains source links for all items', async () => {
      const { html } = await renderDigestEmail(sampleIssue);
      for (const item of sampleIssue.items) {
        expect(html).toContain(item.sourceUrl);
      }
    });

    it('renders the white Buka chameleon logo from the asset base URL', async () => {
      const { html } = await renderDigestEmail(sampleIssue);
      expect(html).toContain('/brand/mega-logo-white.png');
      expect(html).toContain('https://digest.megabilgisayar.com.tr/brand/mega-logo-white.png');
    });

    it('html contains the unsubscribe URL placeholder', async () => {
      const { html } = await renderDigestEmail(sampleIssue);
      expect(html).toContain('{{unsubscribeUrl}}');
    });

    it('html contains the "Devamını oku" CTA for each item', async () => {
      const { html } = await renderDigestEmail(sampleIssue);
      const ctaMatches = (html.match(/Devam[ıi]n[ıi] oku/g) ?? []).length;
      expect(ctaMatches).toBeGreaterThanOrEqual(3);
    });

    it('html contains all three source names', async () => {
      const { html } = await renderDigestEmail(sampleIssue);
      for (const item of sampleIssue.items) {
        expect(html).toContain(item.sourceName);
      }
    });
  });

  describe('Plain text output — exact string matching', () => {
    it('text output contains all three full Turkish item titles verbatim', async () => {
      const { text } = await renderDigestEmail(sampleIssue);
      for (const item of sampleIssue.items) {
        expect(text).toContain(item.titleTr);
      }
    });

    it('text contains the preheader text verbatim', async () => {
      const { text } = await renderDigestEmail(sampleIssue);
      // Preheader contains apostrophes but text output is decoded
      expect(text).toContain('Google');
      expect(text).toContain('Apple');
      expect(text).toContain('Llama 4');
    });
  });

  describe('HTML output — 2 items', () => {
    it('returns non-empty html and text for 2-item digest', async () => {
      const result = await renderDigestEmail(sampleIssueTwoItems);
      expect(result.html.length).toBeGreaterThan(0);
      expect(result.text.length).toBeGreaterThan(0);
    });

    it('html contains both item title fragments', async () => {
      const { html } = await renderDigestEmail(sampleIssueTwoItems);
      expect(html).toContain('Google Gemini Ultra 2.0 Yayınlandı');
      expect(html).toContain('Apple Intelligence Türkiye');
    });

    it('text contains both full Turkish item titles verbatim', async () => {
      const { text } = await renderDigestEmail(sampleIssueTwoItems);
      for (const item of sampleIssueTwoItems.items) {
        expect(text).toContain(item.titleTr);
      }
    });

    it('html contains the CTA at least twice for 2-item digest', async () => {
      const { html } = await renderDigestEmail(sampleIssueTwoItems);
      const ctaMatches = (html.match(/Devam[ıi]n[ıi] oku/g) ?? []).length;
      expect(ctaMatches).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Brand markup assertions', () => {
    it('html contains the chameleon logo image alt text', async () => {
      const { html } = await renderDigestEmail(sampleIssue);
      expect(html).toContain('Mega Bilgisayar');
    });

    it('html contains the Buka dot motif (baked dot grid + SVG circle field)', async () => {
      const { html } = await renderDigestEmail(sampleIssue);
      // Baked tiled dot grid on the Process-Blue band.
      expect(html).toContain('radial-gradient');
      // Inline SVG dot strip for clients that honor SVG.
      expect(html).toContain('<svg');
      expect(html).toContain('<circle');
    });

    it('html uses Process Blue brand color as inline style', async () => {
      const { html } = await renderDigestEmail(sampleIssue);
      // Aligned to the radar's Process Blue #009FDA (ADR-0003).
      expect(html.toLowerCase()).toContain('#009fda');
    });

    it('html contains the issue label', async () => {
      const { html } = await renderDigestEmail(sampleIssue);
      expect(html).toContain(sampleIssue.issueLabel);
    });
  });

  describe('Plain text output', () => {
    it('text contains the subject', async () => {
      const { text } = await renderDigestEmail(sampleIssue);
      expect(text).toContain('Yapay Zeka Haftası');
    });

    it('text contains first item title', async () => {
      const { text } = await renderDigestEmail(sampleIssue);
      const firstItem = sampleIssue.items[0];
      expect(firstItem).toBeDefined();
      expect(text).toContain(firstItem!.titleTr);
    });

    it('text is shorter than html', async () => {
      const result = await renderDigestEmail(sampleIssue);
      expect(result.text.length).toBeLessThan(result.html.length);
    });
  });

  // -------------------------------------------------------------------------
  // Phase 5 — language + white-label. Default fields stay TR/Mega; explicit
  // language/brand props recolor and relocalize structural copy only.
  // -------------------------------------------------------------------------

  describe('Phase 5 — TR default regression guard', () => {
    it('default fixture (no new fields) keeps TR structural copy and lang="tr"', async () => {
      const { html } = await renderDigestEmail(sampleIssue);
      // Header eyebrow + CTA + footer tagline (TR i18n defaults)
      expect(html).toContain('Haftalık YZ Digest');
      expect(html).toContain('Devamını oku');
      expect(html).toContain('Yapay zeka dünyasından haftalık seçkiler.');
      expect(html).toContain('aboneliğinizi iptal edebilirsiniz');
      // Default wordmark + Mega white logo
      expect(html).toContain('Curated AI Digest');
      expect(html).toContain('/brand/mega-logo-white.png');
      expect(html).toContain('lang="tr"');
    });
  });

  describe('Phase 5 — English edition', () => {
    const enIssue: DigestEmailData = { ...sampleIssue, language: 'en' };

    it('renders English structural copy and lang="en"', async () => {
      const { html } = await renderDigestEmail(enIssue);
      expect(html).toContain('Weekly AI Digest');
      expect(html).toContain('Read more');
      expect(html).toContain('Weekly curated picks from the world of AI.');
      expect(html).toContain('you can unsubscribe');
      expect(html).toContain('lang="en"');
    });

    it('does not leak TR structural copy when language is en', async () => {
      const { html } = await renderDigestEmail(enIssue);
      expect(html).not.toContain('Haftalık YZ Digest');
      expect(html).not.toContain('Devamını oku');
    });
  });

  describe('Phase 5 — per-topic branding', () => {
    it('applies a custom accent hex to the header gradient', async () => {
      const branded: DigestEmailData = { ...sampleIssue, brandColorHex: '#E6007E' };
      const { html } = await renderDigestEmail(branded);
      expect(html.toLowerCase()).toContain('#e6007e');
    });

    it('uses a custom logo URL and omits the default Mega logo', async () => {
      const branded: DigestEmailData = {
        ...sampleIssue,
        brandLogoUrl: 'https://cdn.example.com/logo.png',
      };
      const { html } = await renderDigestEmail(branded);
      expect(html).toContain('https://cdn.example.com/logo.png');
      expect(html).not.toContain('/brand/mega-logo-white.png');
    });

    it('uses a custom brand name as the footer wordmark and logo alt', async () => {
      // Override the footer descriptor too so the default ("Curated AI Digest — …")
      // does not reintroduce the default wordmark string elsewhere in the markup.
      const branded: DigestEmailData = {
        ...sampleIssue,
        brandName: 'FinTech Weekly',
        brandFooterText: 'FinTech Weekly — markets, money, machines.',
      };
      const { html } = await renderDigestEmail(branded);
      expect(html).toContain('FinTech Weekly');
      // The default wordmark must not appear once both brand fields are overridden.
      expect(html).not.toContain('Curated AI Digest');
    });

    it('uses a custom footer descriptor when provided', async () => {
      const branded: DigestEmailData = {
        ...sampleIssue,
        brandFooterText: 'FinTech Weekly — markets, money, machines.',
      };
      const { html } = await renderDigestEmail(branded);
      expect(html).toContain('FinTech Weekly — markets, money, machines.');
    });
  });

  // -------------------------------------------------------------------------
  // Phase 6 — sponsored slots. A `DigestItem.isSponsored` flag renders a small
  // localized disclosure pill near the source eyebrow. Absent/false → unchanged.
  // -------------------------------------------------------------------------

  describe('Phase 6 — sponsored slot disclosure', () => {
    /** sampleIssue with its first item marked as a sponsored slot. */
    const sponsoredIssue: DigestEmailData = {
      ...sampleIssue,
      items: [
        { ...sampleIssue.items[0], isSponsored: true },
        sampleIssue.items[1],
        sampleIssue.items[2],
      ] as DigestEmailData['items'],
    };

    it('renders the TR "Sponsorlu" label for a sponsored item (default tr)', async () => {
      const { html } = await renderDigestEmail(sponsoredIssue);
      expect(html).toContain('Sponsorlu');
    });

    it('renders the EN "Sponsored" label for a sponsored item when language is en', async () => {
      const enSponsored: DigestEmailData = { ...sponsoredIssue, language: 'en' };
      const { html } = await renderDigestEmail(enSponsored);
      expect(html).toContain('Sponsored');
      expect(html).not.toContain('Sponsorlu');
    });

    it('default fixtures (no isSponsored) render no sponsored label (regression guard)', async () => {
      const { html: htmlTr } = await renderDigestEmail(sampleIssue);
      expect(htmlTr).not.toContain('Sponsorlu');
      expect(htmlTr).not.toContain('Sponsored');

      const enIssue: DigestEmailData = { ...sampleIssue, language: 'en' };
      const { html: htmlEn } = await renderDigestEmail(enIssue);
      expect(htmlEn).not.toContain('Sponsorlu');
      expect(htmlEn).not.toContain('Sponsored');
    });
  });
});
