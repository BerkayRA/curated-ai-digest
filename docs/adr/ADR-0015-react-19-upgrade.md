# ADR-0015 — React 19 upgrade

- **Status:** Accepted
- **Date:** 2026-06-30
- **Phase:** Maintenance (deferred backlog)
- **Relates to:** [[ADR-0013-next15-vitest3-upgrade]] (kept React 18.3 then; this completes that follow-up and unblocks Next 16)

## Context

ADR-0013 upgraded to Next 15 but deliberately kept **React 18.3** to decouple the
async-request-API migration from React 19's type churn and the next-auth/React-19
surface. React 19 was tracked as a follow-up. It is also a **prerequisite for
Next 16** (the next major), so it lands first.

## Decision

Upgrade **react / react-dom 18.3 → 19.2.7** (in `apps/web` and `packages/email`),
with `@types/react` → 19.2.17 and `@types/react-dom` → 19.2.3.

- **No react-email bump required.** The installed `@react-email/render@1.4.0` and
  `@react-email/components@0.0.32` already declare React 19 in their peer ranges
  (`^18.0 || ^19.0`), and `.npmrc` sets `strict-peer-dependencies=false`, so the
  install is clean. The email package renders via `react-dom/server` (through
  `@react-email/render`); React 19 changed those server APIs, so the render path
  was the primary risk — its 75 tests pass unchanged.
- **No source changes.** The codebase does not use the patterns React 19 removed
  or tightened (no arg-less `useRef`, no `defaultProps` on function components, no
  legacy context / string refs, no reliance on the removed global `JSX` behaviour
  that 19's types break). A full type-check across all 9 workspaces reports **zero
  errors**, so no `types-react-codemod` pass was needed. This ADR therefore
  documents a dependency-only change.

## Consequences

- **Positive:** current React 19; Next 16 is now unblocked. No behavioural change.
- **Verification (the right gate for a dep-only change):** type-check clean across
  all 9 workspaces; **all tests pass** (email render 75, web 383, others
  unaffected); lint clean; and a full production `next build` **compiles
  successfully** under React 19.
- **Tracked follow-ups:** Next 15 → 16 (+ Vitest 3 → 4) next; the non-fatal
  jose/Edge warning from next-auth persists (unrelated to React).
