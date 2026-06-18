# Radar Design Language → Curated AI Digest echo guide

> Extracted from the radar's committed design system (`src/radar/web/templates/_base_styles.html`,
> a single dependency-free Jinja `<style>` partial) by the S1 research workflow. The radar's
> README states this system was **"Generated with the Open Design app and ported into the
> shared design system"** following the Mega standard (light + dark). Curated AI Digest (a standalone
> project) adopts the **same** Mega design standard, so it stays visually consistent with any
> radar it's optionally paired with.

## Tokens — light (`:root`)

| Token | Hex | Role |
|---|---|---|
| `--blue` | `#009FDA` | **Process Blue** — primary, hero band, adopt accent, focus ring (held constant in dark too) |
| `--blue-dark` | `#0082B3` | adopt text, links |
| `--blue-darker` | `#005F85` | pilot ring/text |
| `--cool-gray` | `#BCBEC0` | borders, footer dot-pattern |
| `--surface-30` | `#E8E8E9` | border / light tint |
| `--surface-20` | `#F0F0F0` | footer bg, row hover |
| `--bg` / `--surface` | `#FFFFFF` | page / cards |
| `--text` | `#1A1A1A` | ink (not pure black) |
| `--muted` | `#6B7280` | secondary text |
| `--border` | `#E8E8E9` · `--border-mid` `#BCBEC0` | |
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)` | card shadow (cards only) |

Semantic (hardcoded): **watch** amber accent `#C89100` / text `#8C6200`; **avoid** red `#B93025`;
OK greens `#15803d`/`#166534`. Badge hues: startup violet `#6d28d9` on `#ede9fe`; community green
`#166534` on `#dcfce7`; individual amber `#854d0e` on `#fef9c3`; academic pink `#9d174d` on `#fce7f3`.

## Tokens — dark (`@media (prefers-color-scheme: dark)`) — navy, not gray

`--blue` `#009FDA` (constant) · `--blue-dark` `#33B3E8` · `--blue-darker` `#60AACC` ·
`--cool-gray` `#2E3D52` · `--bg` `#0C1118` · `--surface` `#181E2A` · `--text` `#DDE4EF` ·
`--muted` `#8499B5` · `--border` `#222B3A` · `--link` `#33C0F0`.

## Typography

```css
--font: "Centrale Sans", "Hanken Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif;
```
- **Centrale Sans** via `local()` only (commercial, not bundled).
- **Hanken Grotesk** (OFL) is the bundled fallback — self-hosted `woff2`, weights **400/700**, `font-display: swap`. **Switch Curated AI Digest's fallback from Nunito Sans → Hanken Grotesk for unity.**
- Mono: `ui-monospace, "SF Mono", monospace` (ring labels, numbers).
- `h1` 1.9rem/700/-0.02em · `h2` 1.25rem/700 · **eyebrow labels** 0.7rem UPPERCASE, `letter-spacing .06–.08em`, 700, muted (the signature label tell).

## Radius ladder & depth

`0.3rem` badges · `0.4rem` inputs/chips · `0.5rem` cards/tables (`overflow:hidden`) · `999px` pills.
One soft shadow on cards only; everything else = 1px borders. Container `max-width:1060px`.

## Signature components

- **Hero**: full-bleed `#009FDA` band, white logo (`mega-logo-white.svg` ~44px), white h1,
  `rgba(255,255,255,.82)` tagline (max 62ch), inline nav. **Buka dot-pattern** overlay via
  `::before`: `radial-gradient(circle, rgba(255,255,255,.18) 1.5px, transparent 1.5px); background-size:20px 20px;`
- **Footer**: mirrors hero on `#F0F0F0` with gray dots `rgba(188,190,192,.45)`; `⬇` chip links.
- **Ring pills** (999px, uppercase mono): `~12% bg tint + ~30% border + solid darker text`.
  adopt=blue · pilot=deeper blue · watch=amber `#C89100/#8C6200` · avoid=red `#B93025`.
- **Stat cards**: 3px colored **top accent** per ring + big number + uppercase muted label.
- **Provider/backer badges**: `0.3rem` radius, emoji + one hue per type (see tokens).
- **Trend arrows**: plain unicode `↑ rising / → steady / ↓ falling` (no icon font).
- **Tables**: header row `--row-hover` bg, uppercase muted `th`, **3px blue left-rail on first `th`**.
- **Sticky filter bar** (`position:sticky; top:0`): text search + selects; **focus glow**
  `border-color: var(--blue); box-shadow: 0 0 0 3px rgba(0,159,218,.16);`
- **Scan-health**: native `<details>` (no JS), green `✓` ok / amber `⚠` warnings.

## Theming mechanism

CSS custom properties + `@media (prefers-color-scheme: dark)` — **no toggle, no JS**. Same token
names redeclared in the dark block; `--blue` constant. Flex layouts (not grid); semantic landmarks.

## Echo guide — moves Curated AI Digest adopts (web + email)

1. **Process-Blue hero band + white Buka dots** (web via `::before`; **email: bake the dot grid
   into a tiled background-image or a pre-rendered PNG band** — clients strip pseudo-elements).
2. **The exact token set** as the shared contract (inline literal hexes in email).
3. **Pill/badge recipe** (tint-bg / colored-border / solid-text) for section tags, "new/featured", categories.
4. **Emoji source badges**, one hue per type; centralize the emoji+color map in one module so web+email never drift.
5. **Unicode trend arrows** for "this week's risers".
6. **Eyebrow label + 3px Process-Blue accent** (card top-bar / table left-rail) — the cheapest "Mega" tell.
7. **Restrained depth + the radius ladder** (one shadow, 1px borders, `0.3/0.4/0.5/999px`).
8. **Cool-Gray footer with gray Buka dots + chip links + Process-Blue focus glow.** Dark mode:
   automatic `prefers-color-scheme`, navy surfaces (`#0C1118`/`#181E2A`/`#DDE4EF`), `#009FDA` constant.

## Reusable brand assets in the radar repo (`src/radar/web/static/brand/`)

`mega-logo-white.svg`, `mega-logo-blue.svg`, `favicon.png`, `fonts/hanken-grotesk-{400,700}.woff2`.
Pull these for vector logos + the matching fallback font.
