# ADR-0012 — Monetization (sponsored slots, sponsor analytics, premium tier)

- **Status:** Accepted
- **Date:** 2026-06-26
- **Phase:** 6 (Monetization)
- **Supersedes / relates to:** [[ADR-0007-multi-topic-platform]] (Topic is the unit that carries `tier`), [[ADR-0008-engagement-analytics]] (sponsor performance reuses the click analytics), [[ADR-0009-consent-and-double-opt-in]] (the `public` vs `business` consent mode is the monetization boundary), [[ADR-0011-white-label-and-reach]] (sponsored slots disclose in the same email + archive surfaces)

## Context

With the platform shipped through Phase 5, Phase 6 lets a newsletter pay for
itself. The scope is an MVP across three capabilities, with one inviolable rule.

**Hard rule:** monetization surfaces — sponsored slots and the premium upsell —
appear **only on `public` topics, never on `business`/B2B topics.** B2B topics
are existing-relationship lists; injecting paid content there is both a trust and
a compliance problem. This rule is enforced in code at every layer, not just
documented.

## Decision

1. **Sponsored slot = a `kind` on `IssueItem`, not a new content stream.**
   `IssueItem.kind` (`editorial` | `sponsored`, default `editorial`) + a nullable
   `sponsorId` FK to a new `Sponsor` model. A sponsored slot **occupies one of the
   existing 2–3 item positions** (the `@@unique([issueId, order])` + 0–2 range is
   unchanged) rather than adding a fourth — this keeps the email `items` tuple and
   the "don't redesign the email" constraint intact. The editor marks an existing
   slot sponsored and picks a sponsor; it does not create extra items. A future
   additive 4th-slot design is possible but out of scope.

2. **`Sponsor` is non-secret config.** name, websiteUrl, logoUrl, contactEmail,
   notes, active. URLs are **https-only** (Zod refine on write) because they are
   rendered as `<a href>`/`<img src>`. Sponsors are **deactivated, not deleted**
   (`DELETE` → 405; `onDelete: SetNull` on the FK so historical issues never break).

3. **The public-topic gate is enforced in four independent layers** (defense in
   depth — no single point of trust):
   - **API (authoritative):** `checkSponsoredItems` (pure, in `lib/monetization.ts`)
     is called from `PATCH /api/issues/[id]` — a sponsored item is rejected (400)
     unless the issue's topic is `public` AND the `sponsorId` references an active
     sponsor.
   - **Editor UI:** the sponsored control is rendered only when the topic's
     `consentMode === 'public'`; business topics never show it.
   - **Archive render:** the public archive discloses the "Sponsorlu" pill only
     when `topic.consentMode === 'public'`.
   - **Send boundary:** `buildDigestEmailData` (dispatch) coerces `isSponsored` to
     false unless the topic is public, so even a hypothetically mis-stored
     sponsored item can never render a paid label in an email to a B2B list.

4. **Sponsor performance reuses the Phase 2 click analytics.** A raw-SQL
   `SponsorAnalyticsRepository` (parameterized via `Prisma.sql`) reports engaged
   clicks per issue carrying the sponsor's slot, plus a total. Attribution is at
   the issue level (an `EmailEvent` links to a `Send`, not to a specific item) —
   the dashboard label says so. Counts only; no subscriber PII.

5. **Premium tier is a stored marker; live billing is DEFERRED.** `Topic.tier`
   (`free` | `premium`, default `free`) + an admin toggle. It gates **nothing**
   yet — no paywall, no access change. **No payment processor, no Stripe keys, no
   billing data** are introduced; per the project rule, secrets never enter the DB
   and none are added to env in this phase. A future phase wires billing to act on
   `tier`.

## Consequences

- **Positive:** a public newsletter can carry a clearly-labelled sponsored slot
  and show the sponsor what their placement earned (clicks), and topics can be
  flagged premium — all with zero change to the default editorial newsletter
  (every existing item is `editorial`, every topic `free`, verified in the DB).
- **The hard rule is structurally enforced**, not merely conventional: a business
  topic cannot acquire a sponsored slot through the API, the UI, the archive, or
  the send path.
- **Deliberate non-goals:** live billing/payments (premium is inert), a 4th
  additive sponsored slot (sponsored occupies an editorial position), and
  per-item click attribution (issue-level only). Each is a clean future addition.
- **Known limitations (tracked):** if a sponsor is deactivated after an issue is
  saved, the stored slot is not retroactively cleared (low impact — the email
  renders the item's own stored copy, not live sponsor data; the archive links to
  the sponsor site). A pre-dispatch re-validation could close this later.

## Verification

- 1098 unit tests pass with **no `DATABASE_URL`**: the sponsor repos, the pure
  sponsored-slot gate (`checkSponsoredItems`), the sponsor + topic Zod schemas
  (incl. https-only URL guards), the sponsor API routes, the email "Sponsorlu"
  render, and the archive label are all covered DB-free.
- Type-check clean across all 9 workspaces; lint clean.
- Migration `20260626000000_phase6_monetization` is additive and was applied to
  the dev DB; verified read-only that all existing topics are `tier=free` and all
  existing items are `kind=editorial` (byte-identical fallback).
- Code review + security review run on the full diff; findings addressed
  (same-origin guard on the issue PATCH, picker endpoint projected to id+name,
  render-boundary URL guards, send-boundary gate, analytics query parameterized).
