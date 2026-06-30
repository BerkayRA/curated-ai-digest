# ADR-0018 — Post-upgrade polish

- **Status:** Accepted
- **Date:** 2026-06-30
- **Phase:** Maintenance (deferred backlog)
- **Relates to:** [[ADR-0016-next16-vitest4-upgrade]], [[ADR-0017-turbopack-migration]], [[ADR-0014-archive-rate-limiting]]

## Context

Three small follow-ups remained after the Next 16 / Turbopack work: a non-fatal
jose/Edge build warning from next-auth, two cosmetic Turbopack filesystem-trace
warnings, and making the rate-limiter's client-IP resolution cloud-LB-ready.

## Decision

1. **jose/Edge `DecompressionStream` warning — resolved by the Turbopack
   migration; no change needed.** Under webpack (ADR-0016) the build surfaced a
   warning that `@auth/core`'s `jose` dependency uses `DecompressionStream`, "not
   supported in the Edge Runtime." After the Turbopack migration (ADR-0017) the
   warning no longer appears. The session path never exercised that code (JWT,
   not compressed JWE), and the CI login E2E confirms the proxy auth works.

2. **Turbopack filesystem-trace warnings — silenced with `turbopackIgnore`.** The
   Turbopack build warned about two `path.resolve(process.cwd(), …)` calls
   (`apps/web/lib/candidates.ts` and `packages/curation/src/ingest/import-pool.ts`)
   that compute the runtime candidate-pool directory. These are runtime filesystem
   paths, not modules to trace; the documented `/* turbopackIgnore: true */`
   annotation on the `process.cwd()` argument silences them. The build is now
   warning-free.

3. **`getClientIp` is cloud-LB-ready via `TRUSTED_CLIENT_IP_HEADER`.** When the app
   is fronted by a CDN / cloud load balancer, set this env var to the provider's
   canonical client-IP header (e.g. `cf-connecting-ip`, `x-real-ip`) — a value the
   provider sets and strips, so it is not client-spoofable. Unset (the default),
   resolution is unchanged: `x-forwarded-for` → `x-real-ip` → localhost. Documented
   in `apps/web/.env.example`.

   **A Redis-backed shared limiter store is deliberately NOT added.** It would be
   speculative infrastructure (a Redis service + client + config) for a
   single-instance self-hosted deployment that is not horizontally scaled — the
   existing in-process limiter is correct for that model. The seam is documented
   (the limiter's module note + this ADR): if the app ever scales horizontally,
   swap the in-process `Map` for a shared store and set `TRUSTED_CLIENT_IP_HEADER`.

## Consequences

- The Turbopack production build is now warning-free; the rate limiter keys on a
  non-spoofable IP behind a CDN/LB when configured.
- **Verification:** type-check clean across 9 workspaces; **1109 tests pass** (4
  new for the trusted-header path); lint clean; Turbopack build compiles with no
  warnings.
- **Remaining tracked follow-up:** ESLint 9 + flat config — **blocked** by the
  local `config-protection` hook, which refuses writes to any `eslint.config.*`
  file. Unblocking requires temporarily disabling that hook (or creating the flat
  config files by hand); deferred until then. Redis shared limiter remains
  out-of-scope until horizontal scaling.
