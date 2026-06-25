# Product Roadmap — Curated AI Digest → Multi‑Topic Newsletter Platform

> Status: v1 shipped and operational. This roadmap evolves the product from a
> single weekly AI digest into a **multi‑topic newsletter platform** — many
> independent newsletters, each with its own sources, curation, audience,
> schedule, and branding — then layers on engagement analytics, self‑serve
> growth, send optimization, and white‑label reach.
>
> **Progress:** Phase 0 ✅ · Phase 1a ✅ (Topic entity + isolation) · Phase 1b ✅
> (Topic management + switcher) · Phase 1c → next.

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

Stabilize the flaky `web#test` source tests; baseline visual snapshots and make the E2E smoke a required gate; set `APP_BASE_URL` so email assets/links are absolute; confirm Claude pricing for trustworthy cost reporting; minor housekeeping (prune dead UI, clear stale dev drafts). Node 20→22 and Next 14→15 upgrades tracked separately.

## Phase 1 — Multi‑topic foundation _(flagship)_

**Value:** spin up a new AI newsletter for any audience in minutes — its own sources, voice, schedule, and subscribers. Architecture: **fully isolated per‑topic** (each topic owns its sources and candidate pool end‑to‑end). Delivered in three shippable steps:

- **1a ✅ — Topic entity + data isolation (invisible):** `Topic` is a first‑class model; `topicId` is added across sources, candidates, ingest runs, issues, and pipeline runs, with composite `(topic, week)` / `(topic, url)` keys. A backfill migration attached all existing data to a seed `enterprise-ai` topic — zero change to today's newsletter. The pipeline and prompts are parameterized by topic.
- **1b ✅ — Topic management:** a Topics admin page (create/edit/pause) and a topic switcher that scopes sources, the archive, and curation via `?topic=<slug>`. Verified: a second newsletter (`edge-ai`) created end‑to‑end, with the first topic untouched and its sources isolated.
- **1c — Per‑topic audience & delivery:** subscribers opt into topics individually; each topic runs its own schedule and sends only to its own subscribers, from its own address.

## Phase 2 — Engagement analytics

**Value:** the numbers leadership wants. Open and click tracking via provider webhooks; per‑issue and per‑topic dashboards (open rate, CTR, top stories, subscriber growth, send history). Privacy‑respecting and aggregate.

## Phase 3 — Self‑serve growth

**Value:** the list grows itself. Public per‑topic signup/landing pages, double opt‑in confirmation, and a subscriber preference center (choose topics, granular unsubscribe). Hardened with rate limiting and bot protection.

## Phase 4 — Send optimization & deliverability

**Value:** measurably higher open rates and inbox placement. A/B subject‑line testing (winner chosen from open data), send‑time optimization, and deliverability health — SPF/DKIM/DMARC checks plus bounce/complaint handling and a suppression list.

## Phase 5 — White‑label & reach

**Value:** one platform, many branded products and channels. Per‑topic branding (logo/colors/from‑address/custom domain), multi‑language editions, and additional channels — Slack/Teams delivery, a public web archive per topic with outbound RSS, and a small read API.

---

## Sequencing

```
Phase 0 (hardening, ~0.5 wk, parallel)
Phase 1a → 1b → 1c   (foundation; everything builds on this)
Phase 2  (needs real sends from 1c)        ─┐ demo the numbers
Phase 3  (needs per-topic subscriptions)    │
Phase 4  (needs analytics from Phase 2)     │
Phase 5  (needs topic config from 1a)      ─┘
```

Natural demo milestones for leadership: **after 1b** (multiple newsletters visible) and **after Phase 2** (engagement numbers).

## How we build it

Each phase ships as its own pull request: design → tests‑first → implementation → code/security review → CI green → merge. New visual surfaces are designed in Open Design against the brand guide before they're built. Migrations are proven to leave the existing newsletter byte‑identical. Architecture decisions are recorded as ADRs (see `docs/adr/`); this roadmap and the architecture docs are updated as the surface grows.
