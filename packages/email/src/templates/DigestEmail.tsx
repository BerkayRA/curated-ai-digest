/**
 * DigestEmail — Mega Bülten weekly AI-news digest template.
 *
 * Bold editorial design that echoes the sibling on-prem AI radar (see
 * docs/RADAR-DESIGN-LANGUAGE.md and docs/design/open-design/email.html):
 *   - Process-Blue header band (gradient #009FDA → #0082B3) carrying the white
 *     Buka chameleon logo + a baked dot-grid motif (the Buka particle texture).
 *   - Bold masthead, numbered story blocks with a 3px Process-Blue accent rule,
 *     and a compact overview band.
 *   - Dark navy footer (the radar navy #0C1118) carrying the chameleon again.
 *
 * Rendering target: React Email → bulletproof HTML for Outlook/Exchange,
 * Gmail, Apple Mail, and other major clients.
 *
 * Outlook / bulletproof compatibility notes:
 * - Table-based layout; no flex/grid in structural divs.
 * - All styles inlined with literal hex values from @mega-bulten/brand tokens
 *   (CSS custom properties are unreliable in Outlook — no `var(--x)`).
 * - MSO conditional comments wrap the rounded container for Outlook.
 * - Web-safe font fallback: clients fall back to Arial regardless of the stack.
 * - Logo is a PNG (clients strip SVG <img>), referenced by absolute URL.
 *
 * List-Unsubscribe header (set on the outbound message object):
 *   List-Unsubscribe: <{{unsubscribeUrl}}>
 *   List-Unsubscribe-Post: List-Unsubscribe=One-Click
 * The worker/ACS provider MUST add these headers before sending.
 */

import * as React from 'react';
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Row,
  Column,
  Img,
  Text,
  Link,
} from '@react-email/components';
import { color } from '@mega-bulten/brand';
import type { DigestEmailData, DigestItem } from '../types.js';

// ---------------------------------------------------------------------------
// Constants — inline token literals (CSS custom properties unsupported in Outlook)
// ---------------------------------------------------------------------------

/** Page background behind the 600px container (the radar's --surface-20). */
const PAGE_BG = color.grayLight; // #F0F0F0
/** White card surface for masthead + stories. */
const CARD_BG = color.surface; // #FFFFFF
/** Process-Blue header band + accents. */
const BRAND = color.brand; // #009FDA
const BRAND_DARK = color.brandDark; // #0082B3
const BRAND_DARKER = color.brandDarker; // #005F85
/** Radar navy footer. */
const FOOTER_BG = '#0C1118';
const FOOTER_RULE = '#232B3A';
const FOOTER_TEXT = '#8499B5';
const FOOTER_INK = '#DDE4EF';
const FOOTER_LINK = '#5FC8EF';
const INK = color.ink; // #1A1A1A
const MUTED = color.inkMuted; // #6B7280
const RULE_SOFT = color.surface30; // #E8E8E9

/**
 * Brand font stack — Centrale Sans (commercial, local-only) → Hanken Grotesk
 * (bundled OFL fallback) → web-safe. Email clients without the webfonts fall
 * back to Arial/Helvetica regardless, which is the intended bulletproof path.
 */
const FONT_STACK = `'Centrale Sans','Hanken Grotesk',Arial,Helvetica,sans-serif`;
/** Monospace stack for issue eyebrow + big story numbers (the radar's mono tell). */
const MONO_STACK = `'SFMono-Regular',Consolas,Menlo,monospace`;

/**
 * White Buka chameleon logo + Mega wordmark — a 440×143 PNG in the web app's
 * public dir (clients strip SVG <img>, so a raster is required). Referenced by
 * absolute URL: `${assetBaseUrl}/brand/mega-logo-white.png`.
 */
const LOGO_PATH = '/brand/mega-logo-white.png';
const LOGO_NATURAL_RATIO = 143 / 440; // preserve aspect when scaling width
const HEADER_LOGO_WIDTH = 176;
const HEADER_LOGO_HEIGHT = Math.round(HEADER_LOGO_WIDTH * LOGO_NATURAL_RATIO); // 57
const FOOTER_LOGO_WIDTH = 112;
const FOOTER_LOGO_HEIGHT = Math.round(FOOTER_LOGO_WIDTH * LOGO_NATURAL_RATIO); // 36

const CONTAINER_WIDTH = 600;
const PX = '36px'; // horizontal padding inside the container

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Baked Buka dot-grid for the Process-Blue header band. We tile a single
 * radial-gradient dot over the gradient via background-image so the texture
 * reads even where pseudo-elements (web `::before`) are stripped. An inline
 * SVG <circle> field overlays it for clients that honor SVG, guaranteeing the
 * dot motif is present in the markup (and the `<circle>` brand assertion holds).
 */
function HeaderBand({
  logoUrl,
  issueLabel,
  formattedDate,
}: {
  readonly logoUrl: string;
  readonly issueLabel: string;
  readonly formattedDate: string;
}) {
  return (
    <Section
      style={{
        backgroundColor: BRAND_DARK,
        // Tiled Buka dot grid over a Process-Blue gradient (baked into the band).
        backgroundImage: `radial-gradient(circle at center, rgba(255,255,255,0.18) 1.5px, transparent 1.6px), linear-gradient(118deg, ${BRAND} 0%, ${BRAND_DARK} 60%, ${BRAND_DARKER} 100%)`,
        backgroundSize: '20px 20px, 100% 100%',
        backgroundRepeat: 'repeat, no-repeat',
        padding: `30px ${PX} 26px`,
      }}
    >
      {/* Logo + eyebrow row */}
      <Row>
        <Column valign="middle" style={{ verticalAlign: 'middle' }}>
          <Img
            src={logoUrl}
            width={HEADER_LOGO_WIDTH}
            height={HEADER_LOGO_HEIGHT}
            alt="Mega Bilgisayar"
            style={{ display: 'block', border: '0' }}
          />
        </Column>
        <Column valign="middle" style={{ textAlign: 'right', verticalAlign: 'middle' }}>
          <Text
            style={{
              fontFamily: FONT_STACK,
              fontSize: '11px',
              fontWeight: '700',
              letterSpacing: '1.4px',
              textTransform: 'uppercase',
              color: '#FFFFFF',
              margin: '0',
              lineHeight: '1',
            }}
          >
            Haftalık YZ Bülteni
          </Text>
        </Column>
      </Row>

      {/* Eyebrow issue label on the band */}
      <Row>
        <Column style={{ paddingTop: '20px' }}>
          <Text
            style={{
              fontFamily: MONO_STACK,
              fontSize: '12px',
              fontWeight: '700',
              letterSpacing: '1.4px',
              textTransform: 'uppercase',
              color: '#FFFFFF',
              margin: '0',
              lineHeight: '1',
            }}
          >
            № {issueLabel}&nbsp;&nbsp;·&nbsp;&nbsp;{formattedDate}
          </Text>
        </Column>
      </Row>

      {/* Inline SVG dot strip — guarantees a <circle> motif in markup for
          clients that honor SVG; degrades to the baked gradient otherwise. */}
      <Row>
        <Column style={{ paddingTop: '18px', lineHeight: '0', fontSize: '0' }}>
          <DotStrip />
        </Column>
      </Row>
    </Section>
  );
}

/**
 * A thin inline SVG dot strip (the Buka particle field) drawn over the band.
 * Deterministic for stable SSR. Outlook ignores SVG and falls back to the
 * solid Process-Blue band + tiled gradient dots above.
 */
function DotStrip() {
  const dots: ReadonlyArray<{
    readonly cx: number;
    readonly cy: number;
    readonly r: number;
    readonly opacity: number;
  }> = [
    { cx: 4, cy: 8, r: 1.5, opacity: 0.9 },
    { cx: 14, cy: 4, r: 1.5, opacity: 0.7 },
    { cx: 24, cy: 9, r: 1.5, opacity: 0.85 },
    { cx: 34, cy: 5, r: 1.5, opacity: 0.6 },
    { cx: 44, cy: 8, r: 1.5, opacity: 0.8 },
    { cx: 54, cy: 4, r: 1.5, opacity: 0.5 },
    { cx: 64, cy: 9, r: 1.5, opacity: 0.7 },
    { cx: 74, cy: 5, r: 1.5, opacity: 0.45 },
    { cx: 84, cy: 8, r: 1.5, opacity: 0.6 },
    { cx: 94, cy: 4, r: 1.5, opacity: 0.4 },
    { cx: 104, cy: 9, r: 1.5, opacity: 0.5 },
    { cx: 114, cy: 5, r: 1.5, opacity: 0.32 },
    { cx: 124, cy: 8, r: 1.5, opacity: 0.4 },
    { cx: 134, cy: 4, r: 1.5, opacity: 0.26 },
    { cx: 144, cy: 9, r: 1.5, opacity: 0.32 },
    { cx: 154, cy: 5, r: 1.5, opacity: 0.2 },
    { cx: 164, cy: 8, r: 1.5, opacity: 0.24 },
    { cx: 174, cy: 4, r: 1.5, opacity: 0.16 },
    { cx: 184, cy: 9, r: 1.5, opacity: 0.18 },
    { cx: 194, cy: 5, r: 1.5, opacity: 0.12 },
  ];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="200"
      height="14"
      viewBox="0 0 200 14"
      role="presentation"
      aria-hidden="true"
      style={{ display: 'block', width: '100%', maxWidth: '100%', height: 'auto' }}
    >
      {dots.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill="#FFFFFF" opacity={d.opacity} />
      ))}
    </svg>
  );
}

/** Compact overview band: "01 Source · 02 Source · 03 Source". */
function OverviewBand({ items }: { readonly items: readonly DigestItem[] }) {
  return (
    <Section style={{ backgroundColor: CARD_BG, padding: `4px ${PX} 24px` }}>
      <Row>
        <Column style={{ borderTop: `1px solid ${RULE_SOFT}`, paddingTop: '14px' }}>
          <Text
            style={{
              fontFamily: MONO_STACK,
              fontSize: '13px',
              color: MUTED,
              margin: '0',
              lineHeight: '1.4',
            }}
          >
            {items.map((item, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span>&nbsp;&nbsp;·&nbsp;&nbsp;</span>}
                <span style={{ color: BRAND, fontWeight: '700' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                &nbsp;{item.sourceName}
              </React.Fragment>
            ))}
          </Text>
        </Column>
      </Row>
    </Section>
  );
}

interface StoryBlockProps {
  readonly item: DigestItem;
  readonly index: number;
  readonly isLast: boolean;
}

/**
 * A numbered story block: big mono number + UPPERCASE source eyebrow +
 * 3px Process-Blue accent rule + headline + summary + "devamını oku →".
 */
function StoryBlock({ item, index, isLast }: StoryBlockProps) {
  const number = String(index + 1).padStart(2, '0');

  return (
    <Section style={{ backgroundColor: CARD_BG, padding: `0 ${PX}` }}>
      <Row>
        {/* Big mono number column */}
        <Column
          valign="top"
          width={64}
          style={{ width: '64px', verticalAlign: 'top', padding: '6px 18px 0 0' }}
        >
          <Text
            style={{
              fontFamily: MONO_STACK,
              fontSize: '40px',
              lineHeight: '1',
              fontWeight: '700',
              color: BRAND,
              margin: '0',
            }}
          >
            {number}
          </Text>
        </Column>

        {/* Story content column */}
        <Column valign="top" style={{ verticalAlign: 'top' }}>
          {/* Source eyebrow */}
          <Text
            style={{
              fontFamily: FONT_STACK,
              fontSize: '11px',
              fontWeight: '700',
              letterSpacing: '1px',
              textTransform: 'uppercase',
              color: MUTED,
              margin: '0 0 8px 0',
              lineHeight: '1.2',
            }}
          >
            Kaynak · {item.sourceName}
          </Text>

          {/* 3px Process-Blue accent rule */}
          <div
            style={{
              width: '34px',
              height: '3px',
              backgroundColor: BRAND,
              borderRadius: '2px',
              margin: '0 0 12px 0',
              fontSize: '0',
              lineHeight: '0',
            }}
          >
            &nbsp;
          </div>

          {/* Headline */}
          <Text
            style={{
              fontFamily: FONT_STACK,
              fontSize: '21px',
              lineHeight: '26px',
              fontWeight: '800',
              letterSpacing: '-0.4px',
              color: INK,
              margin: '0 0 8px 0',
            }}
          >
            {item.titleTr}
          </Text>

          {/* Summary */}
          <Text
            style={{
              fontFamily: FONT_STACK,
              fontSize: '15px',
              lineHeight: '23px',
              color: MUTED,
              margin: '0 0 12px 0',
            }}
          >
            {item.summaryTr}
          </Text>

          {/* CTA link */}
          <Link
            href={item.sourceUrl}
            style={{
              fontFamily: FONT_STACK,
              fontSize: '14px',
              fontWeight: '700',
              color: BRAND_DARK,
              textDecoration: 'none',
            }}
          >
            Devamını oku&nbsp;→
          </Link>
        </Column>
      </Row>

      {/* Soft divider between stories (skip after the last one) */}
      {!isLast && (
        <Row>
          <Column style={{ padding: '22px 0' }}>
            <div
              style={{
                borderTop: `1px solid ${RULE_SOFT}`,
                fontSize: '0',
                lineHeight: '0',
              }}
            >
              &nbsp;
            </div>
          </Column>
        </Row>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Main template
// ---------------------------------------------------------------------------

export function DigestEmail(props: DigestEmailData) {
  const {
    subject,
    preheader,
    issueDate,
    issueLabel,
    items,
    unsubscribeUrl,
    senderAddress,
    assetBaseUrl,
  } = props;

  const logoUrl = `${assetBaseUrl ?? ''}${LOGO_PATH}`;

  const formattedDate = new Date(issueDate).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const lastIndex = items.length - 1;

  return (
    <Html lang="tr" dir="ltr">
      <Head>
        {/* No webfont declarations: bulletproof clients fall back to Arial. The
            brand stack hint is applied inline on every text node. */}
      </Head>

      {/* Hidden preview text — max ~90 chars before Gmail clips */}
      <Preview>{preheader}</Preview>

      <Body
        style={{
          backgroundColor: PAGE_BG,
          margin: '0',
          padding: '24px 12px',
          fontFamily: FONT_STACK,
          WebkitTextSizeAdjust: '100%',
          MozTextSizeAdjust: '100%',
        }}
      >
        {/* MSO: fixed-width wrapper so Outlook respects the 600px container. */}
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          align="center"
        >
          <tbody>
            <tr>
              <td align="center">
                {/* eslint-disable-next-line react/no-danger */}
                <div
                  dangerouslySetInnerHTML={{
                    __html: `<!--[if mso]><table role="presentation" width="${CONTAINER_WIDTH}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->`,
                  }}
                />
                <Container
                  style={{
                    width: '600px',
                    maxWidth: '600px',
                    margin: '0 auto',
                    backgroundColor: CARD_BG,
                    borderRadius: '8px',
                    overflow: 'hidden',
                  }}
                >
                  {/* ----------------------------------------------------------
                   * HEADER — Process-Blue band, white Buka chameleon + dot grid
                   * ---------------------------------------------------------- */}
                  <HeaderBand
                    logoUrl={logoUrl}
                    issueLabel={issueLabel}
                    formattedDate={formattedDate}
                  />

                  {/* ----------------------------------------------------------
                   * MASTHEAD — bold subject + short blue accent rule + lede
                   * ---------------------------------------------------------- */}
                  <Section style={{ backgroundColor: CARD_BG, padding: `34px ${PX} 4px` }}>
                    <Row>
                      <Column>
                        <Text
                          style={{
                            fontFamily: FONT_STACK,
                            fontSize: '34px',
                            lineHeight: '38px',
                            fontWeight: '800',
                            letterSpacing: '-1px',
                            color: INK,
                            margin: '0 0 14px 0',
                          }}
                        >
                          {subject}
                        </Text>
                        <div
                          style={{
                            width: '48px',
                            height: '4px',
                            backgroundColor: BRAND,
                            borderRadius: '2px',
                            margin: '0 0 14px 0',
                            fontSize: '0',
                            lineHeight: '0',
                          }}
                        >
                          &nbsp;
                        </div>
                        <Text
                          style={{
                            fontFamily: FONT_STACK,
                            fontSize: '16px',
                            lineHeight: '24px',
                            color: MUTED,
                            margin: '0',
                          }}
                        >
                          {preheader}
                        </Text>
                      </Column>
                    </Row>
                  </Section>

                  {/* ----------------------------------------------------------
                   * OVERVIEW BAND — "01 … · 02 … · 03 …"
                   * ---------------------------------------------------------- */}
                  <OverviewBand items={items} />

                  {/* ----------------------------------------------------------
                   * STORY BLOCKS — numbered, accent rule, CTA
                   * ---------------------------------------------------------- */}
                  {items.map((item, i) => (
                    <StoryBlock key={i} item={item} index={i} isLast={i === lastIndex} />
                  ))}

                  {/* Spacer before footer */}
                  <Section style={{ backgroundColor: CARD_BG }}>
                    <Row>
                      <Column style={{ padding: `0 ${PX} 30px` }}>&nbsp;</Column>
                    </Row>
                  </Section>

                  {/* ----------------------------------------------------------
                   * FOOTER — dark navy band, chameleon again + compliance
                   * ---------------------------------------------------------- */}
                  <Section style={{ backgroundColor: FOOTER_BG, padding: `30px ${PX}` }}>
                    <Row>
                      <Column>
                        <Img
                          src={logoUrl}
                          width={FOOTER_LOGO_WIDTH}
                          height={FOOTER_LOGO_HEIGHT}
                          alt="Mega Bilgisayar"
                          style={{ display: 'block', border: '0', marginBottom: '14px' }}
                        />
                        <Text
                          style={{
                            fontFamily: FONT_STACK,
                            fontSize: '13px',
                            fontWeight: '700',
                            letterSpacing: '1.2px',
                            textTransform: 'uppercase',
                            color: FOOTER_INK,
                            margin: '0 0 6px 0',
                            lineHeight: '1',
                          }}
                        >
                          Mega Bülten
                        </Text>
                        <Text
                          style={{
                            fontFamily: FONT_STACK,
                            fontSize: '13px',
                            lineHeight: '20px',
                            color: FOOTER_TEXT,
                            margin: '0 0 4px 0',
                          }}
                        >
                          Yapay zeka dünyasından haftalık seçkiler.
                        </Text>
                        <Text
                          style={{
                            fontFamily: FONT_STACK,
                            fontSize: '12px',
                            lineHeight: '18px',
                            color: FOOTER_TEXT,
                            margin: '0 0 18px 0',
                          }}
                        >
                          Mega Bülten — Mega Bilişim Teknolojileri&rsquo;nin haftalık yapay zeka
                          digesti.
                        </Text>
                      </Column>
                    </Row>

                    {/* Compliance row — address + unsubscribe */}
                    <Row>
                      <Column
                        style={{
                          borderTop: `1px solid ${FOOTER_RULE}`,
                          paddingTop: '14px',
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: FONT_STACK,
                            fontSize: '12px',
                            lineHeight: '18px',
                            color: FOOTER_TEXT,
                            margin: '0 0 8px 0',
                          }}
                        >
                          Bu e-postayı almak istemiyorsanız{' '}
                          <Link
                            href={unsubscribeUrl}
                            style={{
                              color: FOOTER_LINK,
                              textDecoration: 'underline',
                              fontWeight: '600',
                            }}
                          >
                            aboneliğinizi iptal edebilirsiniz
                          </Link>
                          .
                        </Text>
                        <Text
                          style={{
                            fontFamily: MONO_STACK,
                            fontSize: '11px',
                            lineHeight: '18px',
                            color: FOOTER_TEXT,
                            margin: '0',
                          }}
                        >
                          © {new Date(issueDate).getFullYear()} {senderAddress}
                        </Text>
                      </Column>
                    </Row>
                  </Section>
                </Container>
                {/* eslint-disable-next-line react/no-danger */}
                <div
                  dangerouslySetInnerHTML={{
                    __html: `<!--[if mso]></td></tr></table><![endif]-->`,
                  }}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </Body>
    </Html>
  );
}

// React Email dev preview: default export with sample data
export { DigestEmail as default };
