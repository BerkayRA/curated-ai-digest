# ADR-0002 — Typography (Centrale Sans licensing)

**Status:** Accepted · **Date:** 2026-06-16

## Context

Mega's brand font is **Centrale Sans** (commercial, typedepot). Web + email distribution of
a licensed font requires the proper webfont license; shipping it unlicensed is not allowed.

## Decision

- **v1 ships with Nunito Sans** as the web + email typeface — a close rounded-geometric
  humanist sans consistent with Centrale Sans's character.
- Self-host/subset Nunito Sans for web; `font-display: swap`.
- Email always carries a web-safe fallback (`Arial, Helvetica, sans-serif`).
- The **`mega` wordmark stays an image asset** regardless (brand rule: never re-typeset).
- If/when Mega provides licensed Centrale Sans webfont files, swap them into
  `packages/brand` behind the same `--font-sans` token — no consumer changes needed.

## Consequences

- Unblocks the build immediately; no licensing dependency on the critical path.
- Token-based font wiring makes the later swap a one-file change.
