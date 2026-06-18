# ADR-0002 — Typography (Centrale Sans licensing)

**Status:** Accepted · **Date:** 2026-06-16 · **Revised:** 2026-06-18 (ADR-0003 alignment)

## Context

Mega's brand font is **Centrale Sans** (commercial, typedepot). Web + email distribution of
a licensed font requires the proper webfont license; shipping it unlicensed is not allowed.

## Decision

- **Bundled fallback = Hanken Grotesk** (OFL). Revised from the original Nunito Sans choice to
  match the **onprem-ai-adoption-radar** (a radar Curated AI Digest can optionally integrate with),
  which self-hosts Hanken Grotesk as its Centrale Sans fallback. Using the same fallback keeps
  them visually consistent when paired (ADR-0003). Self-hosted `woff2` (weights 400/700) in `packages/brand/fonts` +
  `apps/web/public/fonts`, wired via `@font-face` in `tokens.css`, `font-display: swap`.
- Font stack: `'Centrale Sans', 'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', sans-serif`
  — Centrale Sans loads only via `local()` when the visitor has it installed.
- Email always carries a web-safe fallback (`Arial, Helvetica, sans-serif`).
- The **`mega` wordmark stays an image/SVG asset** (brand rule: never re-typeset). We use the
  radar's vector chameleon lockup (`mega-logo-{white,blue}.svg`).
- If/when Mega provides licensed Centrale Sans webfont files, swap them in behind the same
  `--font-sans` token — no consumer changes.

## Consequences

- Shared fallback font + shared vector logos with the radar → visual unity.
- Token-based font wiring keeps the later Centrale Sans swap a one-file change.
