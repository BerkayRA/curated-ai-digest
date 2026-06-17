/**
 * Mega brand design tokens — single source of truth (TS).
 *
 * Email clients (notably Outlook) don't reliably support CSS custom properties,
 * so email templates MUST use these literal values inline. The web dashboard can
 * use either these values or the matching CSS custom properties in `tokens.css`.
 *
 * Derived from docs/BRAND.md (Mega kurumsal kimlik + Buka figür).
 */

export const color = {
  /** Pantone Process Blue — primary brand color. */
  brand: '#0089CF',
  brandDark: '#0A6FA3',
  brandTint: '#E6F4FB',
  /** Pantone Cool Gray 3. */
  gray: '#C8C9C7',
  grayLight: '#EDEEEE',
  /** Brand black. */
  ink: '#1A1A1A',
  inkMuted: '#5A5F63',
  surface: '#FFFFFF',
  /** Buka dot-dissolve accent particles — decorative motif ONLY (never logo/text). */
  accentTeal: '#36B39A',
  accentOrange: '#F39200',
  accentMagenta: '#E6007E',
} as const;

export const font = {
  /** Web/email body + headings (Nunito Sans fallback for commercial Centrale Sans; see ADR-0002). */
  sans: "'Nunito Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  /** Email web-safe fallback stack — most clients won't load webfonts. */
  emailSafe: "Arial, Helvetica, sans-serif",
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

export const radius = {
  sm: '6px',
  md: '12px',
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

export const motion = {
  durationFast: '150ms',
  durationNormal: '300ms',
  easeOutExpo: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const;

export const tokens = { color, font, space, radius, fontSize, motion } as const;
export type Tokens = typeof tokens;
