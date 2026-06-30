# ADR-0014 — Public archive rate limiting

- **Status:** Accepted
- **Date:** 2026-06-30
- **Phase:** Maintenance (deferred backlog)
- **Relates to:** [[ADR-0011-white-label-and-reach]] (introduced the public archive + RSS), [[ADR-0009-consent-and-double-opt-in]] (established the in-process `checkRateLimit` used for the public growth endpoints)

## Context

Phase 5 shipped a public, unauthenticated per-topic web archive
(`/archive/[topicSlug]`, `/archive/[topicSlug]/[isoWeek]`) plus an RSS feed
(`/archive/[topicSlug]/rss.xml`). The ADR-0011 review flagged that these routes
were **not rate-limited**: although the pages are ISR-cached (`revalidate=300`),
a flood of requests for **distinct** paths (`/archive/foo`, `/archive/bar`, …)
each miss the cache and perform a DB topic lookup. That is an unbounded,
unauthenticated DB-load vector.

## Decision

**Enforce a per-IP fixed-window rate limit on all `/archive` paths in the
middleware**, returning `429 Too Many Requests` (with `Retry-After`) before any
route handler or RSC page — and therefore before any DB query — runs.

- **One enforcement point.** The middleware already runs on every request; the
  archive index, single-issue pages, and the RSS route all share the `/archive`
  prefix, so a single guard covers all three. No per-route duplication.
- **Reuses the existing limiter.** `checkRateLimit` + `getClientIp`
  (`lib/rate-limit.ts`, the same in-process fixed-window limiter used by the
  Phase 3 public growth endpoints). A new pure helper
  `checkArchiveRateLimit(pathname, headers)` (`lib/public-rate-limit.ts`)
  encapsulates the path match + limit, and is unit-tested without Next.js.
- **Limit: 60 requests / minute / IP** across all archive paths combined
  (~1 req/s sustained). Generous for a human browsing several issues and for
  feed readers polling RSS; tight enough to bound a single-IP flood. All archive
  sub-paths share one per-IP bucket so distinct-path enumeration is also bounded.

## Consequences

- **Positive:** the public archive can no longer be used to drive unbounded DB
  load from one IP; abusive clients get a fast 429 with `Retry-After` and never
  reach the topic lookup.
- **Scope/limits (inherited from the limiter, documented there):**
  - **In-process, single-instance.** Buckets live in a module-scope `Map`; they
    do not survive a restart and are per-instance. The deployment is
    single-instance self-hosted Docker, matching this assumption. Horizontal
    scaling would require a shared store (e.g. Redis) — tracked, not needed now.
  - **Trusts `x-forwarded-for`.** `getClientIp` reads the first forwarded value,
    which is only trustworthy behind a reverse proxy that sets/strips it (the
    documented self-hosted assumption). A spoofed header lets a client vary its
    apparent IP; this is an accepted limitation of the IP-based control for this
    deployment, not a regression.
- **No effect on authenticated routes** — the guard matches only `/archive` and
  `/archive/*`; everything else flows through the unchanged auth path.

## Verification

- 7 unit tests for `checkArchiveRateLimit` (limit boundary, 429 + `Retry-After`,
  window reset, per-IP isolation, shared bucket across sub-paths, non-archive
  passthrough) — all DB-free, fake-timer driven.
- Type-check clean; full web suite **382 tests** pass; lint clean; production
  `next build` succeeds (the limiter bundles cleanly into the Edge middleware,
  88.6 → 88.9 kB).
- **Live smoke:** flooding `/archive/smoke-topic` ×65 against a dev server
  returned 60×`404` (allowed, topic absent) then 5×`429` with `Retry-After: 54`
  — the limit fires exactly at the 61st request.
