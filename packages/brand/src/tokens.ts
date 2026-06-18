/**
 * Mega brand design tokens — single source of truth (TS), aligned to the shared
 * "Mega standard" used by the sibling onprem-ai-adoption-radar so the two products
 * read as one system. See docs/RADAR-DESIGN-LANGUAGE.md + ADR-0003.
 *
 * Email clients (notably Outlook) don't reliably support CSS custom properties, so
 * email templates use these literal values inline. The web app uses these or the
 * matching CSS custom properties in `tokens.css`.
 */

/** Light-mode palette (the radar's `:root`). */
export const color = {
  /** Process Blue — primary brand (held constant across light + dark). */
  brand: '#009FDA',
  /** Adopt text / links. */
  brandDark: '#0082B3',
  /** Pilot ring/text — deepest blue. */
  brandDarker: '#005F85',
  /** Light tint of brand (hero washes, pill backgrounds). */
  brandTint: '#E6F6FC',
  /** Cool Gray — borders, footer dot-pattern. */
  gray: '#BCBEC0',
  /** Light surface (footer bg, row hover) — was grayLight. */
  grayLight: '#F0F0F0',
  surface20: '#F0F0F0',
  surface30: '#E8E8E9',
  ink: '#1A1A1A',
  inkMuted: '#6B7280',
  surface: '#FFFFFF',
  border: '#E8E8E9',
  borderMid: '#BCBEC0',
  link: '#0082B3',
  /** Buka dot-dissolve accent particles — decorative motif only (never logo/text). */
  accentTeal: '#36B39A',
  accentOrange: '#F39200',
  accentMagenta: '#E6007E',
} as const;

/** Dark-mode palette (the radar's `prefers-color-scheme: dark` block — navy, not gray). */
export const colorDark = {
  brand: '#009FDA',
  brandDark: '#33B3E8',
  brandDarker: '#60AACC',
  brandTint: '#10293A',
  gray: '#2E3D52',
  grayLight: '#141820',
  surface20: '#141820',
  surface30: '#141820',
  ink: '#DDE4EF',
  inkMuted: '#8499B5',
  surface: '#181E2A',
  bg: '#0C1118',
  border: '#222B3A',
  borderMid: '#2E3D52',
  link: '#33C0F0',
} as const;

/** Ring decision vocabulary → {bg tint, border, text} (the radar's pill recipe). */
export const ring = {
  adopt: { bg: 'rgba(0,159,218,0.12)', border: 'rgba(0,159,218,0.35)', text: '#0082B3' },
  pilot: { bg: 'rgba(0,95,133,0.10)', border: 'rgba(0,95,133,0.30)', text: '#005F85' },
  watch: { bg: 'rgba(200,145,0,0.12)', border: 'rgba(200,145,0,0.35)', text: '#8C6200' },
  avoid: { bg: 'rgba(185,48,37,0.10)', border: 'rgba(185,48,37,0.30)', text: '#B93025' },
} as const;

/** Source/provider backer badges — emoji + one hue per type (matches the radar). */
export const backer = {
  big_tech: { emoji: '🏢', label: 'Big Tech', bg: 'rgba(0,159,218,0.14)', text: '#0082B3' },
  startup: { emoji: '🚀', label: 'Startup', bg: '#ede9fe', text: '#6d28d9' },
  community: { emoji: '🌐', label: 'Community', bg: '#dcfce7', text: '#166534' },
  individual: { emoji: '👤', label: 'Individual', bg: '#fef9c3', text: '#854d0e' },
  academic: { emoji: '🎓', label: 'Academic', bg: '#fce7f3', text: '#9d174d' },
} as const;

/** Semantic status colors (hardcoded in the radar). */
export const status = {
  watchAccent: '#C89100',
  watchText: '#8C6200',
  avoid: '#B93025',
  okGreen: '#15803d',
} as const;

export const font = {
  /** Centrale Sans via local() only; Hanken Grotesk (OFL) is the bundled fallback. */
  sans: "'Centrale Sans', 'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace",
  /** Email web-safe fallback — most clients won't load webfonts. */
  emailSafe: "Arial, Helvetica, sans-serif",
} as const;

/** Buka dot-pattern motif (radial-gradient on a 20px tile) — hero (white) + footer (gray). */
export const dotPattern = {
  hero: 'radial-gradient(circle, rgba(255,255,255,0.18) 1.5px, transparent 1.5px)',
  footer: 'radial-gradient(circle, rgba(188,190,192,0.45) 1.5px, transparent 1.5px)',
  size: '20px 20px',
} as const;

/** 4px base spacing scale. */
export const space = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '40px',
  xxl: '64px',
} as const;

/** Deliberate radius ladder (badges → inputs → cards → pills). */
export const radius = {
  badge: '0.3rem',
  input: '0.4rem',
  sm: '6px',
  md: '0.5rem',
  lg: '20px',
  pill: '999px',
} as const;

export const fontSize = {
  xs: '12px',
  sm: '14px',
  base: '16px',
  lg: '20px',
  xl: '28px',
  display: '40px',
} as const;

export const shadow = {
  sm: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
} as const;

export const motion = {
  durationFast: '150ms',
  durationNormal: '300ms',
  easeOutExpo: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const;

export const tokens = {
  color,
  colorDark,
  ring,
  backer,
  status,
  font,
  dotPattern,
  space,
  radius,
  fontSize,
  shadow,
  motion,
} as const;
export type Tokens = typeof tokens;
