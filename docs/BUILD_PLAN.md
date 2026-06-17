# Build Plan — Mega Bülten (subagent-driven)

Subagent legend: **architect**, **code-architect** (TS impl), **tdd-guide**,
**database-reviewer**, **frontend-design**, **security-reviewer**, **e2e-runner**,
**doc-updater**, **build-error-resolver**.

| # | Phase | Subagent | Depends on | Parallel track |
|---|---|---|---|---|
| 0 | Discovery, ADRs, brand foundation | architect + doc-updater | — | spine |
| 1 | Monorepo scaffold | code-architect | 0 | spine |
| 2 | Infra / Docker Compose (web, worker, db) | code-architect + security-reviewer | 1 | spine |
| 3 | Data model / Prisma + Zod contracts ★ | database-reviewer + tdd-guide | 1 | spine |
| 4 | News ingestion (Exa + RSS, dedup) | code-architect + tdd-guide | 3 | A |
| 5 | Email rendering + brand system | frontend-design + ts | 0,1 | B |
| 6 | Dashboard shell + subscriber CRUD | frontend-design + code-architect | 3 | C |
| 7 | Curation pipeline (Claude, cost-routed) ★ | code-architect + tdd-guide | 3,4,5 | A |
| 8 | Delivery providers (ACS/Graph/Resend) | code-architect + security-reviewer | 3,5 | B |
| 9 | Approval workflow + draft editor + preview | code-architect + frontend-design + tdd-guide | 5,6,7 | C |
| 10 | Scheduling + auto-send (guardrails) ★ | code-architect + security-reviewer | 7,8,9 | spine |
| 11 | Auth — Entra ID SSO (+ fallback seam) | security-reviewer + code-architect | 6 | D |
| 12 | Testing, visual regression, security pass | tdd-guide + e2e-runner + security-reviewer | all | spine |
| 13 | Polish, docs, deploy runbook | frontend-design + doc-updater | 12 | spine |

**Critical path:** 0 → 1 → 2 → 3 → 7 → 9 → 10 → 12 → 13.
**Parallel after Phase 3:** A = 4→7 · B = 5→8 · C = 6→9 · D = 11.

## Status

- [x] Phase 0 — docs/ADRs/brand foundation
- [x] Phase 1 — monorepo scaffold (8 workspaces install clean)
- [~] Phase 2 — Docker: compose has db+adminer (port 5433); web/worker Dockerfiles pending
- [x] Phase 3 — Prisma + Zod ★ (migration `20260616154231_init`; 79 contract tests green; singleton client; seed)
- [x] Phase 4 — ingestion (Exa + 9 RSS feeds, canonicalize+dedup, idempotent persist; 46 tests)
- [x] Phase 5 — email/brand (React Email digest, Buka dot-dissolve inline SVG, Outlook-safe, placeholder wordmark SVGs; 20 tests)
- [x] Phase 6 — dashboard shell (Next 14 App Router; Archive/Subscribers/Settings + admin API; branded shell; 12 tests; build green)
- [x] Phase 7 — curation pipeline ★ (5 cost-routed Claude stages, tool-use structured output, QA→copywrite retry, idempotent per isoWeek, renderFn injected; 85 curation tests)
- [x] Phase 8 — delivery providers (ACS default + Graph + Resend behind EmailProvider; rate-limit + backoff; factory; 55 email tests)
- [x] Phase 9 — approval workflow + draft editor + live preview + dispatch service + public unsubscribe
- [x] Phase 11 — auth: Entra ID SSO + argon2 local fallback (AUTH_MODE seam). Split edge-safe `auth.config.ts` (middleware) vs Node `auth.ts` (argon2). Fixed two production bugs: argon2 leaking into edge bundle (crashed all routes) + missing `trustHost` (auth failing open). Runtime-verified route protection.
- [ ] Phase 10 — scheduling + auto-send ★ (worker + extract dispatch to shared) ← next
- [ ] Phase 12 — testing/visual/security · Phase 13 — polish/docs

**Verified state:** 334 tests pass (shared 79, curation 85, email 55, web 115); `pnpm -r type-check` clean across 9 workspaces; web build green; auth enforcement runtime-verified (protected→401/redirect, public→200).

**Wiring TODOs surfaced:** worker must add `@mega-bulten/email` to curation deps + pass `renderDigestEmail` as `renderFn`; confirm exact Claude pricing in `pipeline/config.ts`; Graph `sendMail` drops custom headers (List-Unsubscribe must live in HTML footer).

## Key risks (see ARCHITECTURE.md / plan)

M365 bulk throttle/reputation (→ ACS on subdomain) · Centrale Sans licensing (→ Nunito Sans,
ADR-0002) · Turkish quality + hallucination (→ QA agent + approval gate) · Outlook rendering ·
auto-send blast radius (→ guardrails + kill-switch).
