# ADR-0004 — CI/CD and the daily candidate-pool scan

**Status:** Accepted · **Date:** 2026-06-19 · **Branch:** `feat/ci-and-daily-scan`

## Context

The repo is public (`BerkayRA/curated-ai-digest`) but has no CI, and nothing keeps
a **fresh pool of candidate news** ready between weekly runs. We want (a) a CI
gate on every push/PR, and (b) a once-a-day scan so curation always has recent
candidates to work from.

The hard constraint: the project is **self-hosted** (Docker + local Postgres).
GitHub-hosted runners **cannot reach** that database, and the full curation
pipeline needs a paid `ANTHROPIC_API_KEY`. So a daily Action cannot simply write
to the DB or run Claude. Ingestion, however, is **modular and deterministic** —
RSS and the radar source are keyless (see [ADR-0003](ADR-0003-modular-ingestion-radar-and-editorial.md))
and `runIngest()` already accepts an **injectable `IngestRepository`**.

## Decisions

1. **CI workflow (`ci.yml`).** On push to `main` + PRs: `pnpm install --frozen-lockfile`
   → `pnpm --filter @digest/db generate` (Prisma client; no DB) → `turbo run
   type-check test build`. Unit tests mock the DB, so no Postgres service is needed.

2. **Daily scan persists by committing an artifact, not by writing to a DB.**
   The scan runs on a GitHub-hosted runner and commits `data/candidates/` back to
   the repo — the same pattern the on-prem radar uses for its `history.jsonl`.
   This needs **no secrets and no exposed infra**, and yields a versioned,
   auditable, diff-able feed. (Rejected: a publicly-reachable Postgres — breaks
   self-hosting; a self-hosted runner — heavier ops, runs public-repo jobs on
   internal infra.)

3. **Daily job is ingest-only with keyless defaults: RSS + Radar.** No Exa
   (needs `EXA_API_KEY`), no Claude curation (needs `ANTHROPIC_API_KEY` + DB).
   Full curation stays **weekly, in the self-hosted worker**. This keeps the
   daily Action free, deterministic, and secret-free.

4. **File-based `IngestRepository` + `pnpm scan` CLI.** `createFileRepository`
   writes a rolling NDJSON pool (`latest.jsonl`, default cap 200) + `index.json`,
   deduping across runs by `canonicalUrl`/`contentHash`. `runIngest`'s Prisma repo
   is now **lazy-loaded** so the scan path never pulls in `@prisma/client`. The CLI
   resolves its output dir against `INIT_CWD` so `pnpm scan` from the repo root
   always writes to repo-root `data/candidates/`, even though pnpm runs the script
   in the package dir.

5. **Consumption bridge in the worker.** Before each weekly curation,
   `importCommittedCandidates()` reads the committed pool, Zod-validates it, and
   **idempotently upserts** into Postgres. A missing/failed import is non-fatal.
   `CANDIDATES_DIR` points at the committed pool in deployment. The worker's
   weekly croner schedule is unchanged — the scan complements it.

6. **e2e in CI is smoke-only for now.** A single keyless Playwright smoke spec
   (login renders) runs on bundled Chromium via a dedicated config, marked
   `continue-on-error` until the visual-regression snapshots are baselined.

## Consequences

- **+** No paid keys or DB exposure in CI; the candidate pool is versioned and
  auditable; the scan is reproducible and isolates per-source feed failures.
- **−** A bridge step (file → Postgres) is required, and the committed pool grows
  a daily commit (mitigated by the rolling cap + `[skip ci]`). Deployment must keep
  the worker's checkout fresh and set `CANDIDATES_DIR`.
- **Done since:** ESLint wired workspace-wide via `package.json` `eslintConfig`
  (root shared TS config + `apps/web` `next/core-web-vitals`); `lint` re-added to CI.
  Stale feeds refreshed (The Verge → main feed; Anthropic, which has no RSS, → Google
  AI Blog).
- **Follow-ups:** baseline Playwright visual snapshots → make e2e-smoke required;
  optional Exa in the daily job behind a secret.

See [docs/AUTOMATION.md](../AUTOMATION.md) for the operational reference.
