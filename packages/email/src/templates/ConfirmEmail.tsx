/**
 * ConfirmEmail — double opt-in confirmation email for public-topic signups.
 *
 * Minimal branded transactional email (NOT the weekly digest template): the
 * Process-Blue header band with the Buka dot motif, a single confirm CTA, and a
 * KVKK transparency note in the footer. Bulletproof inline styles, mirroring
 * DigestEmail's compatibility approach (table layout, literal hex, MSO wrapper).
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
import { color } from '@digest/brand';
import type { ConfirmEmailData } from '../types';

// ---------------------------------------------------------------------------
// Constants — inline token literals (CSS custom properties unsupported in Outlook)
// ---------------------------------------------------------------------------

const PAGE_BG = color.grayLight; // #F0F0F0
const CARD_BG = color.surface; // #FFFFFF
const BRAND = color.brand; // #009FDA
const BRAND_DARK = color.brandDark; // #0082B3
const BRAND_DARKER = color.brandDarker; // #005F85
const FOOTER_BG = '#0C1118';
const FOOTER_RULE = '#232B3A';
const FOOTER_TEXT = '#8499B5';
const INK = color.ink; // #1A1A1A
const MUTED = color.inkMuted; // #6B7280

const FONT_STACK = `'Centrale Sans','Hanken Grotesk',Arial,Helvetica,sans-serif`;
const MONO_STACK = `'SFMono-Regular',Consolas,Menlo,monospace`;

const LOGO_PATH = '/brand/mega-logo-white.png';
const LOGO_NATURAL_RATIO = 143 / 440;
const HEADER_LOGO_WIDTH = 176;
const HEADER_LOGO_HEIGHT = Math.round(HEADER_LOGO_WIDTH * LOGO_NATURAL_RATIO);

const CONTAINER_WIDTH = 600;
const PX = '36px';

// ---------------------------------------------------------------------------
// Main template
// ---------------------------------------------------------------------------

export function ConfirmEmail(props: ConfirmEmailData) {
  const { topicName, confirmUrl, senderAddress, assetBaseUrl } = props;
  const logoUrl = `${assetBaseUrl ?? ''}${LOGO_PATH}`;

  return (
    <Html lang="tr" dir="ltr">
      <Head />
      <Preview>{`${topicName} aboneliğinizi onaylayın`}</Preview>

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
                  {/* HEADER — Process-Blue band with baked dot grid */}
                  <Section
                    style={{
                      backgroundColor: BRAND_DARK,
                      backgroundImage: `radial-gradient(circle at center, rgba(255,255,255,0.18) 1.5px, transparent 1.6px), linear-gradient(118deg, ${BRAND} 0%, ${BRAND_DARK} 60%, ${BRAND_DARKER} 100%)`,
                      backgroundSize: '20px 20px, 100% 100%',
                      backgroundRepeat: 'repeat, no-repeat',
                      padding: `30px ${PX} 26px`,
                    }}
                  >
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
                      <Column
                        valign="middle"
                        style={{ textAlign: 'right', verticalAlign: 'middle' }}
                      >
                        <Text
                          style={{
                            fontFamily: MONO_STACK,
                            fontSize: '11px',
                            fontWeight: '700',
                            letterSpacing: '1.4px',
                            textTransform: 'uppercase',
                            color: '#FFFFFF',
                            margin: '0',
                            lineHeight: '1',
                          }}
                        >
                          Abonelik Onayı
                        </Text>
                      </Column>
                    </Row>
                  </Section>

                  {/* BODY — heading + lede + confirm CTA */}
                  <Section style={{ backgroundColor: CARD_BG, padding: `34px ${PX} 8px` }}>
                    <Row>
                      <Column>
                        <Text
                          style={{
                            fontFamily: FONT_STACK,
                            fontSize: '28px',
                            lineHeight: '34px',
                            fontWeight: '800',
                            letterSpacing: '-0.6px',
                            color: INK,
                            margin: '0 0 14px 0',
                          }}
                        >
                          E-posta adresinizi onaylayın
                        </Text>
                        <div
                          style={{
                            width: '48px',
                            height: '4px',
                            backgroundColor: BRAND,
                            borderRadius: '2px',
                            margin: '0 0 18px 0',
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
                            margin: '0 0 24px 0',
                          }}
                        >
                          <strong style={{ color: INK }}>{topicName}</strong> listesine abone
                          olmak üzeresiniz. Aboneliğinizi tamamlamak için aşağıdaki düğmeye tıklayın.
                        </Text>
                      </Column>
                    </Row>

                    {/* CTA button */}
                    <Row>
                      <Column style={{ paddingBottom: '8px' }}>
                        <Link
                          href={confirmUrl}
                          style={{
                            display: 'inline-block',
                            backgroundColor: BRAND,
                            color: '#FFFFFF',
                            fontFamily: FONT_STACK,
                            fontSize: '15px',
                            fontWeight: '700',
                            letterSpacing: '0.2px',
                            textDecoration: 'none',
                            padding: '14px 28px',
                            borderRadius: '8px',
                          }}
                        >
                          Aboneliği onayla&nbsp;→
                        </Link>
                      </Column>
                    </Row>

                    <Row>
                      <Column style={{ paddingTop: '20px' }}>
                        <Text
                          style={{
                            fontFamily: FONT_STACK,
                            fontSize: '13px',
                            lineHeight: '20px',
                            color: MUTED,
                            margin: '0',
                          }}
                        >
                          Düğme çalışmıyorsa bu bağlantıyı tarayıcınıza yapıştırın:
                          <br />
                          <Link
                            href={confirmUrl}
                            style={{ color: BRAND_DARK, textDecoration: 'underline', wordBreak: 'break-all' }}
                          >
                            {confirmUrl}
                          </Link>
                        </Text>
                      </Column>
                    </Row>
                  </Section>

                  {/* Spacer */}
                  <Section style={{ backgroundColor: CARD_BG }}>
                    <Row>
                      <Column style={{ padding: `0 ${PX} 24px` }}>&nbsp;</Column>
                    </Row>
                  </Section>

                  {/* FOOTER — KVKK transparency note */}
                  <Section style={{ backgroundColor: FOOTER_BG, padding: `26px ${PX}` }}>
                    <Row>
                      <Column>
                        <Text
                          style={{
                            fontFamily: FONT_STACK,
                            fontSize: '12px',
                            lineHeight: '18px',
                            color: FOOTER_TEXT,
                            margin: '0 0 10px 0',
                          }}
                        >
                          Bu onay e-postasını, e-posta adresinizi {topicName} listesine siz
                          girdiğiniz için aldınız. Siz onaylamadıkça size hiçbir e-posta
                          gönderilmez. Bu işlemi siz başlatmadıysanız bu e-postayı yok sayabilirsiniz.
                        </Text>
                        <Text
                          style={{
                            fontFamily: FONT_STACK,
                            fontSize: '12px',
                            lineHeight: '18px',
                            color: FOOTER_TEXT,
                            margin: '0 0 14px 0',
                          }}
                        >
                          Kişisel verileriniz KVKK kapsamında işlenir; dilediğiniz zaman
                          aboneliğinizi iptal edebilirsiniz.
                        </Text>
                        <Text
                          style={{
                            fontFamily: MONO_STACK,
                            fontSize: '11px',
                            lineHeight: '18px',
                            color: FOOTER_TEXT,
                            margin: '0',
                            borderTop: `1px solid ${FOOTER_RULE}`,
                            paddingTop: '12px',
                          }}
                        >
                          {senderAddress}
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

export { ConfirmEmail as default };
