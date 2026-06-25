# ADR-0009 — Consent model, double opt-in & self-serve growth

- **Status:** Accepted
- **Date:** 2026-06-25
- **Phase:** 3 (Self-serve growth)
- **Supersedes / relates to:** [[ADR-0007-multi-topic-platform]] (consent is per-topic), [[ADR-0008-engagement-analytics]] (public endpoints share the privacy posture)

> **Not legal advice.** This records engineering decisions for KVKK/İYS and EU
> readiness. Verify the lawful-basis choices with counsel before relying on them.

## Context

Phase 3 opens the platform to the public: a topic can grow its own list via a
signup page instead of admin/CSV import only. But the product serves **two very
different audiences**:

- **B2B / existing-relationship** lists — recipients the business already has a
  commercial relationship with (Turkish _tacir/esnaf_ rules + EU soft opt-in).
  These do not require a fresh opt-in, and must NOT have a public signup page.
- **Public** lists — anyone can subscribe, so they require **double opt-in** and
  an auditable consent trail (with monetization in mind for Phase 6).

We needed one model that serves both without letting the public path silently
enroll people, and without weakening the B2B path with consent friction it does
not legally need.

## Decision

1. **Per-topic `consentMode`** (`business` | `public`), defaulting to **`business`**
   (the safe default — opening a public page is an explicit choice). `business`
   topics have no `/s/<slug>` signup page (the route 404s) and are import-only.
   `public` topics expose a signup page with double opt-in.

2. **Recorded lawful basis on every `SubscriberTopic`** — `consentBasis`
   (`business_relationship` | `double_opt_in` | `import` | `single_opt_in`),
   `consentAt`, and `consentSource` (e.g. `public_signup`, `import`, `backfill`,
   `preferences_center`). Existing memberships were backfilled `import` /
   `consentAt = created_at` / `backfill` — no send-behaviour change.

3. **Double opt-in via a `pending` membership state.** Added `pending` to
   `SubscriberStatus`. Public signup creates a `pending` `SubscriberTopic` with a
   single-use `confirmToken` (UUID, its own unique column, cleared to NULL on
   confirm). `findActiveRecipients` already gates on `status = 'active'`, so a
   `pending` member is **never a dispatch recipient**. Confirming flips
   `pending → active`, stamps `consentBasis = double_opt_in`, and clears the
   token. The confirm flow is **idempotent** — a replayed link finds no pending
   row and renders a neutral notice (no "expired" vs "used" distinction).

4. **Unsubscribe always works**, for every basis, via the existing per-topic
   token. The **preference center** (keyed by the global `Subscriber`
   unsubscribe token) lists a subscriber's memberships and toggles them. It only
   **manages existing memberships** — it cannot enroll a subscriber into a topic
   they were never part of (that would bypass double opt-in); re-subscribing an
   existing membership on a `public` topic records `single_opt_in`. Business
   topics cannot be (re)joined from the preference center.

5. **İYS — record-ready now, integrate later.** Turkey's İleti Yönetim Sistemi
   requires registering commercial-message opt-ins/opt-outs (mandatory above the
   ~40 000-recipient threshold). We store everything an integration needs —
   `consentBasis`, `consentAt` (UTC), `consentSource`, and opt-out events
   (`status = 'unsubscribed'` + an `AuditLog` row) — but the **İYS REST API sync
   is deferred** to a dedicated task. _When to do it:_ as the list nears the
   threshold or when counsel advises. _How:_ a scheduled job reading
   `consentBasis = 'double_opt_in'` rows and posting to the İYS API.

6. **Public endpoints are hardened, not session-authed.** `/s/<slug>`,
   `/confirm/<token>`, `/preferences/<token>` and `POST /api/public/*` are in
   `PUBLIC_PREFIXES` (no login). They do NOT use the dashboard's same-origin
   guard (they are reached from email links / standalone forms). Instead:
   - **Rate limiting** — an in-process fixed-window limiter keyed by client IP
     (5/10 min on subscribe, 20/10 min on preferences, 30/min on the confirm &
     preference GET pages). Single-instance only — swap for Redis if scaled
     horizontally; trusts `x-forwarded-for` only behind a proxy that sets it.
   - **Bot protection** — a hidden honeypot field plus a minimum time-to-submit
     check (silently 202, no write).
   - **No subscriber enumeration** — subscribe returns an identical `202` whether
     the email is new, already active, or pending; the only differentiated
     response is a `404` for an unknown/non-public topic (which leaks nothing
     about subscribers). 500s return a generic message and log server-side.

## Consequences

- A clean split: B2B lists keep frictionless import; public lists get a
  defensible double-opt-in trail. The `pending` state reuses the existing
  dispatch gate, so no delivery code changed.
- Confirmation emails send via the existing pluggable provider through a new
  minimal `sendTransactionalEmail` + `ConfirmEmail` template — the weekly digest
  template is untouched. A send failure is swallowed (still `202`, no
  enumeration) but **logged**, so a misconfigured `APP_BASE_URL`/provider is
  visible in server logs instead of leaving silent pending rows.
- The consent fields are the foundation for **Phase 6 monetization**, which has a
  hard rule: sponsored/paid surfaces appear only on `public` topics, never on
  `business`/B2B topics.

## Alternatives considered

- **One global consent policy** — rejected: forces either illegal public sends or
  needless friction on B2B relationships.
- **Reuse `unsubscribeToken` as the confirm token** — rejected: it is a permanent
  opt-out link embedded in every sent email; a single-use, separately-cleared
  `confirmToken` keeps the two purposes from colliding.
- **A separate `Consent` table** — rejected (YAGNI): consent is always read in the
  context of a membership; three columns on `SubscriberTopic` suffice at this
  scale.
