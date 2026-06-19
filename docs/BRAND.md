# Mega Brand System — Curated AI Digest

Source of truth for all visual work (email + dashboard). Derived from Mega's official
*kurumsal kimlik rehberi* and the *Buka figür* asset sheet.

## Palette (Pantone → hex)

| Token | Pantone | Hex | Use |
|---|---|---|---|
| `--color-brand` | Process Blue | `#0089CF` | Primary. Logo, headers, links, primary actions. |
| `--color-gray` | Cool Gray 3 | `#C8C9C7` | Secondary surfaces, borders, muted text. |
| `--color-ink` | Black | `#1A1A1A` | Body text, high-contrast headings. |
| `--color-surface` | — | `#FFFFFF` | Background. Brand uses generous white space. |

Accent dots in the Buka multicolor/dissolve treatment also use teal, orange, and
magenta — use ONLY as decorative particle motif, never for the logo or text.

## Logo rules (strict — from brand guide)

- The `mega` wordmark is **always an image asset** (SVG/PNG). Never re-typeset in any font.
- No geometric container shapes around the logo.
- No deformation / aspect-ratio changes.
- No recoloring outside approved colors (white, Process Blue, or black on suitable grounds).
- The lockup is the Buka chameleon + the `mega bilgisayar` wordmark; do not add or re-typeset any subtitle.
- Provide white logo on blue/dark grounds; blue/black logo on light grounds.

## Mascot — "Buka" the chameleon

Four treatments: solid Process-Blue, Cool-Gray, teal+blue+orange multicolor, and the
signature **dot/particle dissolve** (chameleon breaking into a field of colored dots).

**Use the dot-dissolve as the distinctive hook** for the email header band and the
dashboard — it is what keeps the UI from looking like a generic template.

## Typography

- Brand font is **Centrale Sans** (commercial, typedepot) — NOT bundled. See ADR-0002.
- **Web/email fallback (v1):** **Nunito Sans** — a close rounded-geometric humanist sans.
  Pair: Nunito Sans for headings + body. Self-host/subset for web; `font-display: swap`.
- **Email** must always carry a web-safe fallback stack (`Arial, Helvetica, sans-serif`)
  since most clients won't load custom fonts.

## Design principles (apply to email + dashboard)

- Tokens as CSS custom properties; never hardcode palette/spacing repeatedly.
- Semantic HTML first; compositor-friendly motion only (`transform`, `opacity`).
- Clear hierarchy via scale contrast; intentional rhythm; the dot motif for depth.
- Distinctive, intentional, product-specific — not a default card-grid template.

## Assets needed (tracked)

- [x] `mega bilgisayar` logo lockup SVG (white + blue) — in `packages/brand/assets` and `apps/web/public/brand`.
- [ ] Buka chameleon SVGs (solid blue, dot-dissolve) — for email header + dashboard.
- Until provided, build with placeholders that respect the lockup/proportions.
