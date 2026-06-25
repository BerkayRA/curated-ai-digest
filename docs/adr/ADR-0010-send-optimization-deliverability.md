# ADR-0010 — Send optimization & deliverability

- **Status:** Accepted
- **Date:** 2026-06-25
- **Phase:** 4 (Send optimization & deliverability)
- **Supersedes / relates to:** [[ADR-0008-engagement-analytics]] (A/B winner + send-time reuse open data), [[ADR-0009-consent-and-double-opt-in]] (suppression complements per-topic unsubscribe)

## Context

With per-topic sending (Phase 1c) and engagement analytics (Phase 2) in place,
the next lever is **getting more of the list to open and the mail to land in the
inbox**: test subject lines, send at the right time, keep the sending domain
healthy, and stop mailing addresses that hard-bounce or complain. Phase 4 adds
four independently-shippable capabilities without changing the default send path.

## Decision

1. **A/B subject-line testing — 50/50 two-variant MVP, winner by open rate.**
   An issue may carry `SubjectVariant` rows (subject + `testFraction`). On send,
   if variants exist, the worker dispatches only the **test fraction**
   (`testFractionOnly`) — each recipient deterministically assigned a variant by
   list position (`assignVariant`, pure) — records `Send.variantIndex`, and sets
   `Issue.abStatus = testing` (without transitioning the issue). A third per-topic
   cron (`abcheck:<topicId>`, `AB_HOLDOUT_HOURS = 4` after the send, with the day
   rolled forward when the holdout crosses midnight) runs `runAbWinnerJob`: it
   **atomically claims** the issue (`testing → selecting` via a single
   compare-and-swap `updateMany`, so concurrent/retried runs can't double-send),
   tallies opens per variant from `EmailEvent`, picks the winner
   (`selectWinner` — highest open rate, ties to the lowest index), sets
   `completed` + `abWinnerVariantIndex`, and dispatches the **remainder** with the
   winning subject (`overrideSubject`, skipping recipients already sent). The data
   model uses `variantIndex` (0/1) so N-variant is a later additive change.

2. **Send-time optimization — advisory only.** A topic-scoped raw aggregation
   buckets historical opens (`EmailEvent.occurredAt`) by day-of-week + hour (UTC)
   and recommends the best window on the Analitik dashboard. It does **not**
   auto-reschedule (auto-apply risks fighting a human-set schedule); below 20
   opens it returns "insufficient data" rather than a noisy guess.

3. **Deliverability health — on-demand DNS check, cached.** A server-only checker
   (`node:dns/promises`) resolves SPF / DMARC / DKIM for the sending domain and
   grades each pass/warn/fail with Turkish remediation hints, surfaced in Ayarlar
   with a "Kontrol Et" button. DKIM selector is configured per provider (defaults:
   ACS/Graph `selector1`, Resend `resend`) with a Settings override. Results are
   cached in-process (5-min TTL, capped at 500 entries). The check route requires
   auth + same-origin and validates the address (`email().max(320)`) and selector
   (`max(63)`, label charset) — no arbitrary-host lookups.

4. **Global suppression list — hard bounces & complaints only.** A `Suppression`
   table keyed by **email** (global, distinct from per-topic unsubscribe) is
   consulted by `dispatchIssue` before every send (`isSuppressedBatch`); an empty
   table removes nobody, so the legacy path is byte-identical. ACS/Resend webhooks
   insert a suppression on hard bounce / complaint (in addition to the existing
   per-membership `bounced` status). **Soft (transient) bounces do NOT globally
   suppress** — only the per-membership status applies; the `soft_bounce_threshold`
   reason is reserved for a future count-then-suppress enhancement. Admins can
   list/search/add/remove suppressions in Ayarlar; removals are audit-logged.
   Webhook-supplied emails are lowercased to match normalized stored addresses,
   and the Resend webhook now enforces the Svix ±5-minute timestamp window
   (replay protection).

## Consequences

- All four capabilities are dormant by default: no variants → no A/B split; empty
  suppression table → no filtering; < 20 opens → no send-time hint; the DNS check
  is read-only. The 63 existing dispatch tests prove the default path is unchanged.
- A/B remainder delivery is resilient: the winner job is idempotent (atomic claim
  + already-sent skip), and a thrown test-fraction dispatch transitions the issue
  to `failed` instead of leaving it silently stuck.
- The schema additions (`SubjectVariant`, `Suppression`, `Issue.abStatus/…`,
  `Send.variantIndex`, `Settings.dkimSelector`, two enums) are purely additive.

## Alternatives considered

- **N-variant holdout-then-remainder from day one** — deferred; the 50/50 MVP
  ships the full data model, so N-variant is a UI-only follow-up.
- **Auto-applying the recommended send time** — rejected for MVP (would override
  human schedule decisions; advisory is zero-risk).
- **Soft-bounce count-then-suppress** — deferred; suppressing on transient
  failures is aggressive. Hard bounce + complaint + manual cover the real cases.
- **Persisting DNS results in a table / periodic re-check** — rejected (YAGNI);
  an on-demand check with a short cache fits an admin tool opened rarely.
