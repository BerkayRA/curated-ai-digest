# ADR-0013 — Next.js 15 + Vitest 3 upgrade

- **Status:** Accepted
- **Date:** 2026-06-30
- **Phase:** Maintenance (deferred dependency-audit track)
- **Relates to:** the post-roadmap deferred backlog (tracked in [ROADMAP](../ROADMAP.md))

## Context

The platform shipped Phases 0–6 on Next.js 14.2 and Vitest 2.1. Both were flagged
as deferred upgrades (dependency-audit CVEs + staying current). This ADR records
the upgrade and the version-targeting decision.

By the time of the upgrade, `next` had already moved to **16.x** and `vitest` to
**4.x**. Jumping two majors at once (14→16, 2→4) compounds breaking changes and
risk. We deliberately target the **latest 15.x** (`15.5.19`) and **latest 3.x**
(`3.2.6`) — exactly the requested upgrade — leaving 16/4 as a future, separately
de-risked step.

## Decision

1. **Next.js 14.2 → 15.5.19; eslint-config-next → 15.5.19.** The headline Next 15
   breaking change is the **async request APIs**: `params` / `searchParams` on
   pages, layouts, route handlers, and `generateMetadata`, plus `cookies()` /
   `headers()` / `draftMode()`, are now Promises. Applied via the official
   `@next/codemod next-async-request-api` (transformed 33 files, 0 errors), with
   one manual fix for a handler the codemod skipped (`issues/[id]/preview` — it
   destructured `params` as an unused `_params`, which the codemod didn't match).

2. **React kept at 18.3.** Next 15 fully supports React 18.3; we did **not** jump
   to React 19 in this step. Rationale: React 19 brings its own type-level churn
   and a next-auth-on-React-19 compatibility surface that is orthogonal to the
   Next 15 async-API change we wanted. Decoupling them keeps this upgrade small,
   reviewable, and green. **React 19 is a tracked follow-up.**

3. **next-auth 5.0.0-beta.25 → beta.31.** A patch within the same v5 beta line for
   Next 15 compatibility. The build emits a non-fatal Edge-runtime warning from
   `jose` (`DecompressionStream`) pulled in via `@auth/core`; it does not fail the
   build, and the session path does not use compressed JWE in practice (next-auth
   does not zip tokens by default). The CI login E2E exercises the middleware/auth
   path. Tracked as a watch item, not a blocker.

4. **Vitest 2.1 → 3.2.6, unified across all 8 workspaces.** Two workspaces
   (`shared`, `db`) had already drifted to 3.2.4; the rest were on 2.1.8. All are
   now pinned to 3.2.6. No test code changes were required — the suites migrated
   clean.

5. **next.config.mjs** — `experimental.serverComponentsExternalPackages` →
   top-level `serverExternalPackages` (the Next 15 rename), and added
   `outputFileTracingRoot` (the monorepo root) to silence Next 15's
   "inferred workspace root" warning from the multiple lockfiles.

## Consequences

- **Positive:** current Next 15 + Vitest 3, async request APIs adopted correctly,
  the dependency-audit CVEs in the 14.x / 2.x trees cleared. No application
  behaviour change — every page/route renders as before.
- **Verification:** type-check clean across all 9 workspaces; **1098 tests pass**
  (no `DATABASE_URL`); lint clean; and a full **production `next build` succeeds**
  (run locally with the dev server down — the build caught the one missed route
  that tsc/tests did not).
- **Tracked follow-ups:** React 18 → 19 (+ next-auth React-19 compat); the
  jose/Edge `DecompressionStream` warning; and the next majors (Next 16, Vitest 4)
  as a later, separately-scoped upgrade.

## Notes

- After a local `next build`, the `.next` directory holds production output;
  restart the dev server with `rm -rf apps/web/.next && next dev` before resuming
  local development (the standing no-`build`-while-dev-server gotcha).
