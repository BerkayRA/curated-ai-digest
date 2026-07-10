# Product Roadmap — Curated AI Digest → Multi‑Topic Newsletter Platform

> Status: v1 shipped and operational. This roadmap evolves the product from a
> single weekly AI digest into a **multi‑topic newsletter platform** — many
> independent newsletters, each with its own sources, curation, audience,
> schedule, and branding — then layers on engagement analytics, self‑serve
> growth, send optimization, and white‑label reach.
>
> **Progress:** Phase 0 ✅ · Phase 1a ✅ (Topic entity + isolation) · Phase 1b ✅
> (Topic management + switcher) · Phase 1c ✅ (per-topic subscribers, schedules &
> sending) · Phase 2 ✅ (engagement analytics) · Phase 3 ✅ (self-serve growth:
> per-topic consent mode, public signup + double opt-in, preference center,
> rate-limit + bot protection) · Phase 4 ✅ (send optimization & deliverability:
> A/B subjects, send-time hints, SPF/DKIM/DMARC checks, suppression list) ·
> Phase 5 ✅ (white-label & reach: per-topic branding + TR/EN language, public
> web archive + outbound RSS) · Phase 6 ✅ (monetization: sponsored issue slots +
> per-sponsor click analytics + premium topic tier — public topics only; billing
> deferred). **All roadmap phases shipped.**

## Where we are today (v1)

A self‑hosted, Claude‑powered weekly AI‑news digest for Mega Bilgisayar Tic. Ltd. Şti:

- **Curation pipeline** — ingest (RSS/Exa/on‑prem radar) → rank → curate → Turkish copywrite → editor/QA → branded email render → draft issue. Cost‑routed and observable.
- **LLM‑free curation** — manual picker, heuristic auto‑fill, and per‑slot source fill — assemble an issue with no API key.
- **Delivery** — pluggable email providers (Azure Communication Services default; Microsoft Graph; Resend), retry/backoff, PII‑scrubbed send records.
- **Workflow** — draft → in_review → approved → scheduled → sent, with a guarded auto‑send and kill‑switch.
- **Dashboard** — issue archive + editor with live preview, subscriber management + CSV import, source registry with health, settings; Entra ID SSO + local auth.
- **Ops** — CI (type‑check/test/build + E2E smoke) and a daily keyless news scan.

**Structural limitation:** the system is single‑topic by construction — one issue per ISO week globally, global sources/subscribers/settings, and a hardcoded digest topic. Everything below begins by lifting that limit.

## North star

> One platform, many branded AI newsletters. Add a topic, point it at sources,
> and it curates, schedules, and sends its own weekly issue to its own audience —
> with the numbers to prove it works.

---

## Phase 0 — Hardening _(quick wins, no blockers)_

Stabilize the flaky `web#test` source tests; baseline visual snapshots and make the E2E smoke a required gate; set `APP_BASE_URL` so email assets/links are absolute; confirm Claude pricing for trustworthy cost reporting; minor housekeeping (prune dead UI, clear stale dev drafts).

> **Maintenance — done:** Next 14→**15.5.19** + Vitest 2→**3.2.6** upgrade shipped (async request APIs migrated; React kept at 18.3). See [ADR‑0013](adr/ADR-0013-next15-vitest3-upgrade.md). Next → **16.2.9** + Vitest → **4.1.9** ([ADR‑0016](adr/ADR-0016-next16-vitest4-upgrade.md)), React → **19.2.7** ([ADR‑0015](adr/ADR-0015-react-19-upgrade.md)), and **Turbopack** migration ([ADR‑0017](adr/ADR-0017-turbopack-migration.md)) all shipped. ESLint 9 + flat config ([ADR‑0019](adr/ADR-0019-eslint9-flat-config.md)) also shipped — all dependency-upgrade follow-ups complete.
>
> **Maintenance — done:** per-IP rate limiting on the public archive (+RSS). See [ADR‑0014](adr/ADR-0014-archive-rate-limiting.md).

## Phase 1 — Multi‑topic foundation _(flagship)_

**Value:** spin up a new AI newsletter for any audience in minutes — its own sources, voice, schedule, and subscribers. Architecture: **fully isolated per‑topic** (each topic owns its sources and candidate pool end‑to‑end). Delivered in three shippable steps:

- **1a ✅ — Topic entity + data isolation (invisible):** `Topic` is a first‑class model; `topicId` is added across sources, candidates, ingest runs, issues, and pipeline runs, with composite `(topic, week)` / `(topic, url)` keys. A backfill migration attached all existing data to a seed `enterprise-ai` topic — zero change to today's newsletter. The pipeline and prompts are parameterized by topic.
- **1b ✅ — Topic management:** a Topics admin page (create/edit/pause) and a topic switcher that scopes sources, the archive, and curation via `?topic=<slug>`. Verified: a second newsletter (`edge-ai`) created end‑to‑end, with the first topic untouched and its sources isolated.
- **1c ✅ — Per‑topic audience & delivery:** subscribers opt into topics individually (a `SubscriberTopic` join with per‑topic status + unsubscribe token); dispatch sends only to the issue topic's active members, from the topic's own address (falling back to global Settings); the worker runs one schedule per active topic, reloading every ~5 min so pause/schedule changes apply automatically. Existing subscribers were backfilled into the seed topic with zero behavior change.

## Phase 2 ✅ — Engagement analytics

**Value:** the numbers leadership wants. Open + click tracking (opaque per‑send token → `EmailEvent`; opens labelled approximate) and provider delivery webhooks (ACS/Resend signature‑verified, Graph stubbed); per‑topic **Analitik** dashboard — open rate, CTR, top‑clicked stories, subscriber growth, send history — computed on the fly, aggregate and privacy‑forward (daily‑salted IP hash, coarse device class, no raw PII). Bounces/complaints mark the membership `bounced`. See [ADR‑0008](adr/ADR-0008-engagement-analytics.md).

## Phase 3 ✅ — Self‑serve growth

**Value:** the list grows itself. Public per‑topic signup/landing pages (`/s/<slug>`, public‑mode topics only), double opt‑in confirmation (`pending` membership → single‑use confirm token → `/confirm/<token>` flips to active), and a subscriber preference center (`/preferences/<global‑token>`: per‑topic subscribe/unsubscribe + leave‑all). Public endpoints are hardened with an in‑process IP rate limiter + honeypot/timing bot protection and emit no subscriber‑enumeration signal. See [ADR‑0009](adr/ADR-0009-consent-and-double-opt-in.md).

**Consent model (decided):** each topic has a `consentMode` — **`business`** (existing‑relationship B2B: no prior opt‑in required under TR tacir/esnaf + EU soft‑opt‑in; admin/CSV import only; no public signup) or **`public`** (public signup page + **double opt‑in**). Every `SubscriberTopic` records a `consentBasis` (`business_relationship` | `double_opt_in` | `import` | `single_opt_in`) + `consentAt` + `consentSource` for an auditable lawful‑basis trail. Unsubscribe always works (per‑topic token), regardless of basis. **İYS** (Turkey's national message system): record everything İYS‑ready now (basis/timestamp/source + opt‑out events); the İYS **API sync** is a deferred, dedicated task. _Not legal advice — verify with counsel._

## Phase 4 ✅ — Send optimization & deliverability

**Value:** measurably higher open rates and inbox placement. A/B subject‑line testing (50/50 two‑variant MVP: test fraction → 4h holdout → winner by open rate → remainder send, idempotent via an atomic claim), send‑time optimization (advisory best‑window recommendation from historical opens), and deliverability health — on‑demand SPF/DKIM/DMARC checks in Ayarlar plus a global bounce/complaint **suppression list** consulted on every send. See [ADR‑0010](adr/ADR-0010-send-optimization-deliverability.md).

## Phase 5 ✅ — White‑label & reach

**Value:** one platform, many branded products and channels. Per‑topic **branding** (logo, accent color, display name, footer descriptor — within the existing verified sending domain; custom domains out of scope) and **TR/EN language editions** threaded through curation prompts, the email's structural copy, and the archive — all optional, falling back byte‑identically to the Mega/Turkish default. New **reach** channels: a public per‑topic **web archive** (sent issues only, re‑rendered from `IssueItems`, ISR‑cached) and an **outbound RSS** feed. The dashboard UI stays Turkish; only subscriber‑facing content is localized. Read API and Slack/Teams delivery were deliberately deferred. Security is enforced at the public render boundary (URL‑scheme guards for branding/source links, hex re‑validation, `isoWeek` validation). See [ADR‑0011](adr/ADR-0011-white-label-and-reach.md).

## Phase 6 ✅ — Monetization

**Value:** the newsletter pays for itself. A **"Sponsorlu" issue slot** (an `IssueItem.kind = sponsored` referencing a `Sponsor`, occupying one of the 2–3 slots — labelled in both the email and the public archive), a per‑sponsor **performance view** built on Phase 2 click analytics ("N engaged clicks"), and a **premium topic tier** (`Topic.tier`) with an admin toggle. Direct sponsorship + premium topics over programmatic ads for a niche, high‑intent audience. **Hard rule (enforced in code at four layers — API gate, editor UI, archive render, send boundary):** monetization surfaces **never appear on `business`/B2B topics — only on `public` topics.** **Live billing is deferred** — `tier` is a stored marker only; no payment processor, no secrets. See [ADR‑0012](adr/ADR-0012-monetization.md).

---

## Sequencing

```
Phase 0 (hardening, ~0.5 wk, parallel)
Phase 1a → 1b → 1c   (foundation; everything builds on this)
Phase 2  (needs real sends from 1c)        ─┐ demo the numbers
Phase 3  (needs per-topic subscriptions)    │
Phase 4  (needs analytics from Phase 2)     │
Phase 5  (needs topic config from 1a)      ─┘
Phase 6  (monetization; rides Phase 2 clicks + per-topic subscriptions)
```

Natural demo milestones for leadership: **after 1b** (multiple newsletters visible) and **after Phase 2** (engagement numbers).

## Operability — credits-free curation backends

The LLM stages talk to Claude through one injectable `AnthropicClient` seam, so
the curation backend is swappable without touching stage logic. Two **zero-cost**
paths exist today, plus one deferred:

- **Human-as-LLM** (shipped, `curate:manual`) — export the pool, curate in Claude, paste back. Claude-quality, manual, ToS-clean.
- **Claude Code dev client** (shipped, dev/test only, `pipeline:dev`) — routes the full pipeline through the local `claude -p` CLI on the operator's subscription. Hard-blocked in production, never on the cron path. See [ADR-0020](adr/ADR-0020-pluggable-llm-backends.md).
- **Ollama local adapter** (deferred, future) — the same seam wrapped around the self-hosted `ollama-gpu` box. Unlike the Claude Code client this is ToS-clean and automatable, so it could take the **scheduled/production** send path off metered API credits entirely. Build when there's a need; validate the copywrite stage against the local model first.

Hosting is documented end-to-end in [DEPLOYMENT.md](DEPLOYMENT.md) (Vercel web + Render worker + Neon/Render Postgres).

## How we build it

Each phase ships as its own pull request: design → tests‑first → implementation → code/security review → CI green → merge. New visual surfaces are designed in Open Design against the brand guide before they're built. Migrations are proven to leave the existing newsletter byte‑identical. Architecture decisions are recorded as ADRs (see `docs/adr/`); this roadmap and the architecture docs are updated as the surface grows.
