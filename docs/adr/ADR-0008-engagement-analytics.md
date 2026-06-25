# ADR-0008 — Engagement analytics: tracking model & privacy posture

- **Status:** Accepted
- **Date:** 2026-06-25
- **Phase:** 2 (Engagement analytics)
- **Supersedes / relates to:** [[ADR-0007-multi-topic-platform]] (analytics are per-topic)

## Context

Leadership wants the numbers — open rate, click-through, top stories, subscriber
growth — per issue and per topic. This requires capturing engagement signals
(opens, clicks) and ingesting provider delivery reports (delivered/bounced/
complaint), without turning a customer newsletter into a surveillance tool.

## Decision

1. **Single `EmailEvent` table** keyed to `Send` (which already links to issue →
   topic and subscriber), with a `type` enum (open|click|delivered|bounced|
   complaint). No per-event rollup tables — at this list size (≤ low thousands of
   sends) all metrics are computed on the fly with topic-scoped aggregate SQL.

2. **Opaque per-send `trackToken`** (UUID) embedded in the open pixel and click
   links. It maps an event back to its Send without exposing subscriber identity
   and is unguessable. Click links resolve their destination from the DB
   (`Send → Issue → item[order]`), never from a user-supplied query param, so the
   redirect endpoint has **no open-redirect vector** (and only redirects to
   `http(s)` destinations).

3. **Privacy-forward storage.** We never persist a raw IP or user-agent. Opens/
   clicks store only a **daily-salted HMAC of the IP** (enables same-day dedup,
   not cross-day re-identification) and a **coarse device class**
   (mobile/desktop/bot/unknown). The analytics dashboard exposes aggregates only —
   there is no per-subscriber engagement view. Open rates are labelled
   **approximate** in the UI because image-proxy prefetch (e.g. Apple Mail Privacy
   Protection) inflates them.

4. **Provider webhooks** (`/api/webhooks/{acs,resend,graph}`) are public but
   signature-verified (ACS Event Grid key incl. the validation handshake; Resend
   via inline Svix HMAC — no new dependency; Graph is a stub, as Microsoft Graph
   exposes no delivery webhooks here). Webhook secrets live in env, never the DB.
   Events are deduplicated by a provider event id. A bounce/complaint flips the
   relevant `SubscriberTopic` to `bounced` (already excluded from
   `findActiveRecipients`); full global suppression is deferred to Phase 4.

5. **No chart dependency.** Data-viz is hand-rolled inline SVG styled with the
   design-system tokens, keeping the page-JS budget small and the charts
   on-brand rather than default-library-looking.

## Consequences

- Opens are directionally useful but not exact; we communicate that in-product.
- Engagement data is aggregate and minimally identifying — defensible for a
  customer-facing B2B newsletter.
- Tracking endpoints are public, never error on bad input (pixel always 200, click
  always redirects), and are signature-gated where they mutate trust (webhooks).
- Phase 4 (deliverability) can build on `EmailEvent` for A/B winner selection and
  a proper suppression list without schema churn.
