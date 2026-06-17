/**
 * DigestEmail — Mega Bülten weekly AI-news digest template.
 *
 * Rendering target: React Email → bulletproof HTML for Outlook/Exchange,
 * Gmail, Apple Mail, and other major clients.
 *
 * Outlook compatibility notes:
 * - Table-based layout; no flex/grid in structural divs.
 * - All styles inlined; no <style> block relied upon.
 * - MSO conditional comments used for VML fallback where needed.
 * - Max-width 600px; preview in Litmus/Email on Acid recommended.
 * - Word-break on long URLs in plain-text part only.
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
  Hr,
  Font,
} from '@react-email/components';
import { color, font, space, fontSize, radius } from '@mega-bulten/brand';
import type { DigestEmailData, DigestItem } from '../types.js';

// ---------------------------------------------------------------------------
// Constants — inline token literals (CSS custom properties unsupported in Outlook)
// ---------------------------------------------------------------------------

const CONTAINER_BG = color.surface;
const HEADER_BG = color.brand;
const BODY_BG = '#F4F8FB'; // slightly tinted off-white — more editorial than pure white
const FOOTER_BG = color.ink;

const FONT_STACK = `'Nunito Sans', ${font.emailSafe}`;
const NUNITO_URL =
  'https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700;800&display=swap';

// Wordmark image — hosted path in production. For development previews this
// resolves to the brand assets directory. Replace with CDN URL when deploying.
// The official white wordmark, served from the web app's public dir at
// `${assetBaseUrl}/brand/mega-wordmark-white.png`. Email images are referenced by
// absolute URL (not embedded), so the app must be reachable at assetBaseUrl.
const WORDMARK_PATH = '/brand/mega-wordmark-white.png';
const WORDMARK_WIDTH = 168;
const WORDMARK_HEIGHT = 61;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Inline SVG dot-dissolve header motif — the Buka particle field.
 * Rendered as a raw <td> inner HTML string via dangerouslySetInnerHTML is not
 * used here; instead we output React SVG directly inside a <Section>.
 * Outlook ignores SVG but falls back to the solid Process-Blue background.
 */
function DotBand() {
  // 56 dots across the 600px band — deterministic, stable SSR
  const dots: Array<{ cx: number; cy: number; r: number; fill: string; opacity: number }> = [
    // Dense core cluster — dissolves right
    { cx: 16,  cy: 12, r: 3,   fill: color.brand,         opacity: 0.9  },
    { cx: 26,  cy: 8,  r: 2.5, fill: color.brandDark,     opacity: 0.85 },
    { cx: 36,  cy: 14, r: 3,   fill: color.accentTeal,    opacity: 0.8  },
    { cx: 46,  cy: 8,  r: 2.5, fill: color.brand,         opacity: 0.88 },
    { cx: 54,  cy: 16, r: 2,   fill: '#FFFFFF',            opacity: 0.55 },
    { cx: 20,  cy: 20, r: 2.5, fill: color.accentTeal,    opacity: 0.75 },
    { cx: 30,  cy: 16, r: 3,   fill: color.brand,         opacity: 0.82 },
    { cx: 40,  cy: 22, r: 2,   fill: color.brandDark,     opacity: 0.7  },
    { cx: 50,  cy: 14, r: 3.5, fill: '#FFFFFF',            opacity: 0.4  },
    { cx: 60,  cy: 20, r: 2,   fill: color.brand,         opacity: 0.72 },
    { cx: 12,  cy: 26, r: 2,   fill: '#FFFFFF',            opacity: 0.3  },
    { cx: 24,  cy: 28, r: 2.5, fill: color.brandDark,     opacity: 0.65 },
    { cx: 34,  cy: 24, r: 2,   fill: color.accentTeal,    opacity: 0.6  },
    { cx: 44,  cy: 28, r: 3,   fill: color.brand,         opacity: 0.58 },
    { cx: 56,  cy: 26, r: 2,   fill: '#FFFFFF',            opacity: 0.25 },
    // Mid dissolve — particles scatter
    { cx: 68,  cy: 12, r: 2.5, fill: color.accentOrange,  opacity: 0.55 },
    { cx: 78,  cy: 18, r: 2,   fill: color.brand,         opacity: 0.5  },
    { cx: 88,  cy: 10, r: 3,   fill: '#FFFFFF',            opacity: 0.2  },
    { cx: 98,  cy: 22, r: 2,   fill: color.accentTeal,    opacity: 0.45 },
    { cx: 108, cy: 14, r: 2.5, fill: color.accentMagenta, opacity: 0.4  },
    { cx: 72,  cy: 26, r: 2,   fill: color.brandDark,     opacity: 0.4  },
    { cx: 82,  cy: 30, r: 2.5, fill: color.accentOrange,  opacity: 0.35 },
    { cx: 94,  cy: 24, r: 2,   fill: color.brand,         opacity: 0.38 },
    { cx: 104, cy: 28, r: 3,   fill: '#FFFFFF',            opacity: 0.15 },
    { cx: 116, cy: 20, r: 2,   fill: color.accentTeal,    opacity: 0.3  },
    { cx: 76,  cy: 36, r: 2,   fill: color.accentMagenta, opacity: 0.3  },
    { cx: 88,  cy: 38, r: 2.5, fill: '#FFFFFF',            opacity: 0.12 },
    { cx: 100, cy: 34, r: 2,   fill: color.accentOrange,  opacity: 0.28 },
    { cx: 112, cy: 30, r: 3,   fill: color.brand,         opacity: 0.25 },
    { cx: 122, cy: 24, r: 2,   fill: '#FFFFFF',            opacity: 0.1  },
    // Outer dissolve — sparse, fading
    { cx: 132, cy: 16, r: 2,   fill: color.accentMagenta, opacity: 0.22 },
    { cx: 142, cy: 22, r: 2.5, fill: color.accentTeal,    opacity: 0.18 },
    { cx: 152, cy: 12, r: 2,   fill: '#FFFFFF',            opacity: 0.1  },
    { cx: 160, cy: 28, r: 3,   fill: color.accentOrange,  opacity: 0.15 },
    { cx: 170, cy: 18, r: 2,   fill: color.brand,         opacity: 0.12 },
    { cx: 138, cy: 32, r: 2,   fill: color.brandDark,     opacity: 0.14 },
    { cx: 150, cy: 36, r: 2.5, fill: '#FFFFFF',            opacity: 0.08 },
    { cx: 162, cy: 30, r: 2,   fill: color.accentTeal,    opacity: 0.1  },
    { cx: 172, cy: 38, r: 2.5, fill: color.accentMagenta, opacity: 0.1  },
    { cx: 180, cy: 24, r: 2,   fill: '#FFFFFF',            opacity: 0.06 },
    // Edge wisps
    { cx: 186, cy: 16, r: 2,   fill: color.accentOrange,  opacity: 0.08 },
    { cx: 192, cy: 32, r: 2.5, fill: color.brand,         opacity: 0.06 },
    { cx: 196, cy: 22, r: 2,   fill: '#FFFFFF',            opacity: 0.05 },
    { cx: 175, cy: 44, r: 2,   fill: color.accentTeal,    opacity: 0.08 },
    { cx: 183, cy: 40, r: 3,   fill: color.brandDark,     opacity: 0.06 },
  ];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="600"
      height="56"
      viewBox="0 0 200 56"
      role="presentation"
      aria-hidden="true"
      style={{ display: 'block', maxWidth: '100%' }}
    >
      {dots.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill={d.fill} opacity={d.opacity} />
      ))}
    </svg>
  );
}

interface StoryBlockProps {
  readonly item: DigestItem;
  readonly index: number;
}

function StoryBlock({ item, index }: StoryBlockProps) {
  const isEven = index % 2 === 0;

  return (
    // Outlook requires table wrapper for consistent spacing
    <Section
      style={{
        padding: '0',
        margin: '0',
      }}
    >
      {/* Connector line from previous block (skip first) */}
      {index > 0 && (
        <Row>
          <Column>
            <div
              style={{
                height: '1px',
                backgroundColor: '#E2EEF7',
                margin: `0 ${space.xl} 0 ${space.xl}`,
              }}
            />
          </Column>
        </Row>
      )}
      <Row>
        <Column style={{ padding: `${space.xl} ${space.xl} ${space.lg} ${space.xl}` }}>
          {/* Item number + source — meta line */}
          <Text
            style={{
              fontFamily: FONT_STACK,
              fontSize: fontSize.xs,
              fontWeight: '700',
              color: color.brand,
              letterSpacing: '1.4px',
              textTransform: 'uppercase',
              margin: '0 0 10px 0',
              lineHeight: '1',
            }}
          >
            {String(index + 1).padStart(2, '0')} &nbsp;·&nbsp; {item.sourceName}
          </Text>

          {/* Story title — editorial scale contrast */}
          <Text
            style={{
              fontFamily: FONT_STACK,
              fontSize: fontSize.lg,
              fontWeight: '800',
              color: color.ink,
              lineHeight: '1.3',
              margin: '0 0 12px 0',
              letterSpacing: '-0.3px',
            }}
          >
            {item.titleTr}
          </Text>

          {/* Blue accent rule — intentional hierarchy element */}
          <div
            style={{
              width: '32px',
              height: '3px',
              backgroundColor: isEven ? color.brand : color.accentTeal,
              borderRadius: '2px',
              margin: '0 0 14px 0',
            }}
          />

          {/* Summary */}
          <Text
            style={{
              fontFamily: FONT_STACK,
              fontSize: fontSize.base,
              fontWeight: '400',
              color: color.inkMuted,
              lineHeight: '1.7',
              margin: '0 0 20px 0',
            }}
          >
            {item.summaryTr}
          </Text>

          {/* CTA link */}
          <Link
            href={item.sourceUrl}
            style={{
              display: 'inline-block',
              fontFamily: FONT_STACK,
              fontSize: fontSize.sm,
              fontWeight: '700',
              color: color.brand,
              textDecoration: 'none',
              borderBottom: `2px solid ${color.brand}`,
              paddingBottom: '2px',
              letterSpacing: '0.3px',
            }}
          >
            Devamını oku →
          </Link>
        </Column>
      </Row>
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

  const wordmarkUrl = `${assetBaseUrl ?? ''}${WORDMARK_PATH}`;

  const formattedDate = new Date(issueDate).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <Html lang="tr" dir="ltr">
      <Head>
        {/* Webfont declaration — degrades gracefully to Arial on Outlook */}
        <Font
          fontFamily="Nunito Sans"
          fallbackFontFamily={['Arial', 'Helvetica', 'sans-serif']}
          webFont={{
            url: 'https://fonts.gstatic.com/s/nunitosans/v15/pe0IMImSLYBIv1o4X1M8ce2xCx3yop4tQpF_MeTm0lfGWVpNn64CL7U8upHZIbMV51Q.woff2',
            format: 'woff2',
          }}
          fontWeight={400}
          fontStyle="normal"
        />
        <Font
          fontFamily="Nunito Sans"
          fallbackFontFamily={['Arial', 'Helvetica', 'sans-serif']}
          webFont={{
            url: 'https://fonts.gstatic.com/s/nunitosans/v15/pe0IMImSLYBIv1o4X1M8ce2xCx3yop4tQpF_MeTm0lfGWVpNn64CL7U8upHZIbMV51Q.woff2',
            format: 'woff2',
          }}
          fontWeight={800}
          fontStyle="normal"
        />
      </Head>

      {/* Hidden preview text — max ~90 chars before Gmail clips */}
      <Preview>{preheader}</Preview>

      <Body
        style={{
          backgroundColor: BODY_BG,
          margin: '0',
          padding: '0',
          fontFamily: FONT_STACK,
          WebkitTextSizeAdjust: '100%',
          MozTextSizeAdjust: '100%',
        }}
      >
        {/*
         * Outer wrapper table — required for Outlook to respect max-width.
         * <!--[if mso]> wrapper is not injectable via React Email directly,
         * but the 600px Container + table-layout handles most Outlook cases.
         */}
        <Container
          style={{
            maxWidth: '600px',
            margin: '32px auto',
            backgroundColor: CONTAINER_BG,
            borderRadius: radius.md,
            overflow: 'hidden',
            // Box shadow degrades gracefully — Outlook ignores it
            boxShadow: '0 4px 24px rgba(0,137,207,0.10)',
          }}
        >

          {/* ----------------------------------------------------------------
           * HEADER — Process Blue band with wordmark + dot-dissolve motif
           * ---------------------------------------------------------------- */}
          <Section
            style={{
              backgroundColor: HEADER_BG,
              padding: '0',
            }}
          >
            {/* Wordmark row */}
            <Row>
              <Column style={{ padding: `${space.xl} ${space.xl} ${space.md} ${space.xl}` }}>
                {/* Official Mega white wordmark. alt text is critical for Outlook
                    (images off by default). */}
                <Img
                  src={wordmarkUrl}
                  width={WORDMARK_WIDTH}
                  height={WORDMARK_HEIGHT}
                  alt="mega Bilişim Teknolojileri"
                  style={{ display: 'block' }}
                />
              </Column>
              <Column
                style={{
                  padding: `${space.xl} ${space.xl} ${space.md} 0`,
                  textAlign: 'right',
                  verticalAlign: 'bottom',
                }}
              >
                <Text
                  style={{
                    fontFamily: FONT_STACK,
                    fontSize: fontSize.xs,
                    fontWeight: '700',
                    color: 'rgba(255,255,255,0.65)',
                    letterSpacing: '1.2px',
                    textTransform: 'uppercase',
                    margin: '0',
                    lineHeight: '1',
                  }}
                >
                  Haftalık Bülten
                </Text>
              </Column>
            </Row>

            {/* Dot-dissolve motif band */}
            <Row>
              <Column style={{ padding: '0', lineHeight: '0', fontSize: '0' }}>
                <DotBand />
              </Column>
            </Row>
          </Section>

          {/* ----------------------------------------------------------------
           * ISSUE META — date + label on a subtle tinted strip
           * ---------------------------------------------------------------- */}
          <Section style={{ backgroundColor: color.brandTint, padding: '0' }}>
            <Row>
              <Column style={{ padding: `${space.md} ${space.xl}` }}>
                <Text
                  style={{
                    fontFamily: FONT_STACK,
                    fontSize: fontSize.xs,
                    fontWeight: '700',
                    color: color.brand,
                    letterSpacing: '1.2px',
                    textTransform: 'uppercase',
                    margin: '0',
                    lineHeight: '1',
                  }}
                >
                  {formattedDate} &nbsp;·&nbsp; Sayı {issueLabel}
                </Text>
              </Column>
            </Row>
          </Section>

          {/* ----------------------------------------------------------------
           * SUBJECT / INTRO BANNER
           * ---------------------------------------------------------------- */}
          <Section style={{ backgroundColor: CONTAINER_BG }}>
            <Row>
              <Column style={{ padding: `${space.xl} ${space.xl} ${space.md} ${space.xl}` }}>
                <Text
                  style={{
                    fontFamily: FONT_STACK,
                    fontSize: '26px',
                    fontWeight: '800',
                    color: color.ink,
                    lineHeight: '1.25',
                    margin: '0',
                    letterSpacing: '-0.5px',
                  }}
                >
                  {subject}
                </Text>
                {/* Brand rule */}
                <div
                  style={{
                    width: '48px',
                    height: '4px',
                    backgroundColor: color.brand,
                    borderRadius: '2px',
                    marginTop: '18px',
                  }}
                />
              </Column>
            </Row>
          </Section>

          {/* ----------------------------------------------------------------
           * STORY BLOCKS
           * ---------------------------------------------------------------- */}
          <Section style={{ backgroundColor: CONTAINER_BG }}>
            {items.map((item, i) => (
              <StoryBlock key={i} item={item} index={i} />
            ))}
          </Section>

          {/* ----------------------------------------------------------------
           * DIVIDER before footer
           * ---------------------------------------------------------------- */}
          <Section style={{ backgroundColor: CONTAINER_BG }}>
            <Row>
              <Column style={{ padding: `0 ${space.xl}` }}>
                <Hr
                  style={{
                    borderTop: `2px solid ${color.brand}`,
                    margin: '0',
                  }}
                />
              </Column>
            </Row>
          </Section>

          {/* ----------------------------------------------------------------
           * FOOTER — dark, Mega signature + compliance
           * ---------------------------------------------------------------- */}
          <Section style={{ backgroundColor: FOOTER_BG }}>
            {/* Brand signature row */}
            <Row>
              <Column style={{ padding: `${space.xl} ${space.xl} ${space.lg} ${space.xl}` }}>
                <Text
                  style={{
                    fontFamily: FONT_STACK,
                    fontSize: fontSize.sm,
                    fontWeight: '800',
                    color: color.brand,
                    letterSpacing: '1.5px',
                    textTransform: 'uppercase',
                    margin: '0 0 4px 0',
                    lineHeight: '1',
                  }}
                >
                  mega bülten
                </Text>
                <Text
                  style={{
                    fontFamily: FONT_STACK,
                    fontSize: fontSize.xs,
                    fontWeight: '400',
                    color: 'rgba(255,255,255,0.5)',
                    margin: '0',
                    lineHeight: '1.4',
                  }}
                >
                  Yapay zeka dünyasından haftalık seçkiler
                </Text>
              </Column>
            </Row>

            {/* Compliance row — address + unsubscribe */}
            <Row>
              <Column
                style={{
                  padding: `0 ${space.xl} ${space.xl} ${space.xl}`,
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                  paddingTop: space.lg,
                }}
              >
                <Text
                  style={{
                    fontFamily: FONT_STACK,
                    fontSize: '11px',
                    fontWeight: '400',
                    color: 'rgba(255,255,255,0.35)',
                    margin: '0 0 8px 0',
                    lineHeight: '1.6',
                  }}
                >
                  {senderAddress}
                </Text>
                <Text
                  style={{
                    fontFamily: FONT_STACK,
                    fontSize: '11px',
                    fontWeight: '400',
                    color: 'rgba(255,255,255,0.35)',
                    margin: '0',
                    lineHeight: '1.6',
                  }}
                >
                  Bu e-postayı almak istemiyorsanız{' '}
                  <Link
                    href={unsubscribeUrl}
                    style={{
                      color: color.gray,
                      textDecoration: 'underline',
                      fontWeight: '600',
                    }}
                  >
                    aboneliğinizi iptal edebilirsiniz
                  </Link>
                  .
                </Text>
              </Column>
            </Row>
          </Section>

        </Container>
      </Body>
    </Html>
  );
}

// React Email dev preview: default export with sample data
export { DigestEmail as default };
