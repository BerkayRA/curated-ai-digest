# ADR-0005 — DB-backed data-source registry + dashboard management

**Status:** Accepted · **Date:** 2026-06-19 · **Branch:** `feat/sources-management`

## Context

Data sources were configured **only in code + env**: the RSS feed list in
`packages/curation/src/ingest/sources.ts` (`FEEDS[]`), the radar behind
`RADAR_ENABLED`/`RADAR_FEED_URL`, and Exa behind `EXA_API_KEY`. There was no way to
browse, add, toggle, or test a source from the dashboard. [ADR-0003](ADR-0003-modular-ingestion-radar-and-editorial.md)
already made ingestion modular (the `SourceProvider` interface); this builds the
management layer on top of it.

## Decisions

1. **`Source` Prisma model** (`type` rss|radar|exa, `label`, `url?`, `enabled`,
   `config Json?`, plus persistent health `lastRunAt`/`lastStatus`/`lastCount`/`lastError`,
   timestamps). A migration adds it; a backfill seed turns the current static `FEEDS`
   (incl. Hugging Face Blog) + radar + exa into rows. **Secrets stay in env** — the DB
   stores only the enabled flag + non-secret config, never `EXA_API_KEY`/`AUTH_SECRET`.

2. **DB-driven providers with a static fallback.** `resolveProviders({ repository })`
   builds one provider **per enabled `Source`**, with id `` `${type}:${source.id}` `` so
   counts/errors attribute back to a single source. When the `Source` table is empty it
   **falls back to `defaultProviders()`** (the static list) — backwards-compatible, nothing
   breaks before the seed runs.

3. **The daily GitHub scan stays static.** GitHub-hosted runners can't reach the
   self-hosted Postgres (the reason the scan commits a file artifact — see
   [ADR-0004](ADR-0004-ci-and-daily-scan.md)). So the **Sources UI governs the worker's /
   on-demand ingestion** (DB-backed), while the **daily scan keeps its keyless RSS+Radar
   defaults**. This divergence is intentional and documented. (A future `data/sources.json`
   export could give the scan parity — deferred.)

4. **On-demand ingest + isolated test-fetch.** `POST /api/sources/run` →
   `runIngestFromDb()` runs ingestion from the enabled DB sources into `CandidateArticle`
   and records health (the "⟳ Şimdi Tara" button). `POST /api/sources/[id]/test` runs a
   single provider's `fetch` in isolation and returns count + sample + errors **without
   persisting** (the per-card "Test" preview).

5. **Persistent per-source health.** `recordSourceHealth(result)` maps an
   `IngestResult`'s `bySource` + `errors` back onto `Source` rows after every DB-driven
   ingest, so each card shows `✓ ok` / `⚠ uyarı` + last count + last run.

6. **Admin API + `/sources` ("Kaynaklar") dashboard page**, built to the Mega brand /
   radar design language (`docs/BRAND.md` + `docs/RADAR-DESIGN-LANGUAGE.md`), authored via
   the Open Design app and ported to Next + CSS modules. Routes follow existing conventions
   (session auth, `assertSameOrigin` on mutations, `ok()/err()` envelope, Zod).

## Consequences

- **+** Sources are browsable/editable/testable from the dashboard; per-source health is
  visible; on-demand ingestion closes the "browse → use" loop.
- **−** The Sources UI and the daily scan can diverge (decision 3); mitigation is the
  optional `data/sources.json` export (Option B), deferred.
- Migration is additive (no changes to existing models). Secrets remain in env.
- **Follow-ups:** `data/sources.json` export for scan parity; move the ingestion `topic`
  into Settings (noted in ADR-0003).
