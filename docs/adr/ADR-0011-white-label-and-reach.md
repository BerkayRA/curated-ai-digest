# ADR-0011 — White-label & reach

- **Status:** Accepted
- **Date:** 2026-06-26
- **Phase:** 5 (White-label & reach)
- **Supersedes / relates to:** [[ADR-0007-multi-topic-platform]] (Topic config carries the branding/language columns), [[ADR-0009-consent-and-double-opt-in]] (the archive links to the public signup page for `public` topics)

## Context

After Phases 1–4 the platform runs many isolated newsletters, each with its own
sources, audience, schedule, analytics, and deliverability. The remaining
leadership pitch is **reach**: make each topic look like its own product and let
its issues be discovered and consumed outside the inbox. The approved Phase 5
scope (decided with the user) is deliberately narrow:

1. **Branding only — no custom sending domains.** Per-topic logo, accent color,
   display name, and footer descriptor, all within the existing verified sending
   domain. Custom domains (DNS/DKIM per topic) are explicitly out of scope.
2. **Language-aware per topic (TR + EN).** A topic declares a content language;
   it threads through the curation prompts, the email's *structural* copy, and
   the archive chrome. The **dashboard UI itself stays Turkish** — only
   subscriber-facing content is localized.
3. **Channels: public web archive + outbound RSS only.** No read API, no
   Slack/Teams delivery (both deferred).

## Decision

1. **Branding lives on `Topic` as non-secret config; the email is parameterized,
   not redesigned.** Five nullable columns —
   `brandLogoUrl` / `brandColorHex` / `brandName` / `brandFooterText` /
   `language` — already existed or were added (migration
   `20260702000000_phase5_white_label`). The `DigestEmail` template was
   **parameterized, not restyled**: a new `i18n.ts` zero-dependency string table
   supplies structural copy by language, and the logo/accent/wordmark/footer read
   from props. **Every field is optional and falls back to the Mega / Process-Blue
   / Turkish defaults**, so a topic with no overrides renders byte-identical to
   the pre-Phase-5 output (locked by a regression test). The accent is applied to
   the header gradient's primary stop only; the dark stops stay anchored to the
   brand tokens (a single client hex can't be darkened reliably without a color
   library, which we won't add).

2. **Language is a content concern, not a UI framework.** `language: 'tr' | 'en'`
   threads through: rank/curate/copywrite/QA prompts (EN instruction + EN hype-word
   list), the email string table + `<Html lang>` + locale-aware date, and the
   archive. We did **not** introduce an i18n framework (next-intl etc.) — the
   surface is a handful of structural strings, so a typed string table is simpler
   and keeps the email package dependency-free. The `IssueItem.titleTr/summaryTr`
   columns are kept as-is: for EN topics they hold English copy (the `Tr` suffix
   is historical; documented in code).

3. **The public archive re-renders from `IssueItems`, not stored `bodyHtml`.**
   `/archive/[topicSlug]` lists a topic's **sent issues only**;
   `/archive/[topicSlug]/[isoWeek]` renders one issue from its structured items so
   the web presentation is independent of the email markup and always reflects
   current branding. Both pages are standalone branded routes (not the dashboard
   shell), use **ISR (`revalidate = 300`)** rather than `force-dynamic` (public,
   read-only, changes at most weekly → repeat views serve from cache, not the DB),
   and resolve branding via the same pure helper used for tests.

4. **RSS is a hand-rolled, dependency-free builder.** `buildRssFeed`
   (`@digest/shared`) emits spec-compliant RSS 2.0 with XML-escaped titles/links
   and CDATA-wrapped descriptions (the `]]>` terminator defensively split).
   `/archive/[topicSlug]/rss.xml` serves it with `application/rss+xml` and a
   5-minute cache header. Item permalinks are absolute (built from `APP_BASE_URL`).

5. **The archive is public; security is enforced at the render boundary.**
   `/archive` is added to `PUBLIC_PREFIXES` (no auth). Because topic branding and
   article URLs are rendered into HTML on an unauthenticated surface, every value
   is **re-validated at render time** in addition to Zod-on-write:
   `brandColorHex` must match `#RRGGBB` before it enters inline CSS;
   `brandLogoUrl` must be `https://` (or the bundled path) before it becomes an
   `<img src>`; article `sourceUrl` must be `http(s)` before it becomes an
   `<a href>` (legacy `javascript:`/`data:` values render as plain text). The
   `sourceUrl` Zod schema was also tightened to reject non-http(s) schemes at the
   write boundary. The `isoWeek` route param is validated before the DB query.

## Consequences

- **Positive:** a topic can be made to look like its own product in minutes
  (logo + color + name + language), and its back-catalogue is publicly
  shareable and feed-subscribable — all with zero change to the default Mega/TR
  newsletter and no new runtime dependencies.
- **Deliberate non-goals:** custom sending domains, a read API, and Slack/Teams
  delivery are out of scope for Phase 5. Multi-language is limited to TR/EN and
  to subscriber-facing content (the dashboard stays Turkish).
- **Accepted trade-off — paused topics keep a public archive.** The archive is
  the public record of *what was sent*; pausing a topic stops new issues but does
  not retract the back-catalogue (the signup CTA is hidden for non-`public`/non-
  active topics). If a topic must be fully delisted, that is a future hard-delete
  concern, not an archive gate.
- **Operational:** the public archive pages are uncached on first hit per
  revalidation window; they are not yet rate-limited (the ISR cache absorbs the
  common case). Per-IP rate limiting on the archive pages is a tracked follow-up.

## Verification

- 1065 unit tests pass with **no `DATABASE_URL`** (the archive logic is pure
  helpers; the email render path is exercised with TR-default, EN, and per-field
  branding fixtures; the default-output regression is locked).
- Type-check clean across all 9 workspaces; lint clean.
- Live smoke (dev `:3100`, unauthenticated): empty-state archive renders;
  **sent-only gating** confirmed (a draft issue → 404); RSS serves valid XML with
  the correct content-type and XML-escaping; unknown topic and malformed
  `isoWeek` both → 404.
- Code review + security review run on the full diff; all HIGH/MEDIUM findings
  (URL-scheme XSS guards, render-boundary hex re-validation, `isoWeek` validation,
  ISR) addressed before merge.
