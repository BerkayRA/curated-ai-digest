# ADR-0006 — LLM-free curation on the new-issue page

**Status:** Accepted · **Date:** 2026-06-22 · **Branch:** `feat/llm-free-curation`

## Context

Creating a new issue offered only **"Curation'ı şimdi çalıştır"** — the full Claude
pipeline (`runWeeklyPipeline`, four LLM stages), which needs an `ANTHROPIC_API_KEY`
and costs ~$0.70/run. There was no way to assemble an issue from already-scanned
news without the LLM (or without a key). The daily scan ([ADR-0004](ADR-0004-ci-and-daily-scan.md))
and the on-demand "Şimdi Tara" already fill a real candidate pool — the
`CandidateArticle` table plus the committed `data/candidates/latest.jsonl` artifact —
so the raw material exists; it just wasn't reachable from the editor.

## Decisions

1. **Two LLM-free paths on the new-issue page**, both feeding the existing in-memory
   draft-items list and riding the existing `POST /api/issues` (no new create path):
   - **Curate (manual picker)** — a slide-over (`CandidateCurator`) listing the top 3
     candidates per recently-scanned source; clicking **Ekle** fills the next slot.
   - **Otomatik kürasyon (heuristic backup)** — scores the pool and pre-fills the 3
     slots for review. The lightweight, zero-cost fallback to the Claude pipeline.

2. **Pure scoring/selection** in `packages/curation/src/curate/heuristic.ts` (no IO,
   fully unit-tested): `scoreCandidate` = weighted blend of **recency** (linear decay
   over 14 days), **source authority** (a small tier map), and **topic relevance**
   (keyword hits in title+excerpt, augmented by the configured topic).
   `heuristicCurate` selects the top N with source diversity (per-source cap, relaxed
   to fill). `groupBySourceTopN` powers the picker.

3. **Read-only candidate API** — `GET /api/candidates/recent` (grouped, top 3/source)
   and `GET /api/candidates/auto` (heuristic pre-fill). Both read the `CandidateArticle`
   DB pool, **falling back to the committed file pool** (`readPool`) when the DB is
   empty. No Anthropic/Exa call, no API key, no DB writes.

4. **Raw field mapping is intentional**: `titleTr` = source title, `summaryTr` = source
   excerpt (English). LLM-free means no translation — the editor polishes to Turkish.
   `summaryTr` falls back to the title so it is never blank (the create schema requires
   it). Picked items carry the optional `candidateArticleId` so the created `IssueItem`
   links back to its `CandidateArticle`.

## Consequences

- An issue can be drafted with **no API key and no LLM cost** — useful for local dev,
  for fallback when keys are absent, and for editors who prefer to pick manually.
- The Claude pipeline ("Curation'ı şimdi çalıştır") is unchanged and remains the
  quality default; this sits beside it.
- The heuristic is deterministic and tunable (weights/keywords are named constants);
  it does not write scores back to the DB (the LLM rank stage still owns
  `importanceScore`/`relevanceScore`).
- Candidates group by the `sourceName` string (there is no FK from `CandidateArticle`
  to `Source`); acceptable for grouping and consistent with how the pool is stored.

## Update — per-slot source fill (2026-06-24)

A **third** LLM-free mode: each news slot gets its own **"Kaynaktan doldur…"**
dropdown listing the scanned sources (with an availability count). Choosing a source
fills that slot with the source's top article not already used in any slot — so
re-picking the same source for another slot yields the next article. This is the
finest-grained option (choose the source while filling each slot), beside the
all-source picker and the auto-fill.

- Reuses `GET /api/candidates/recent` (no new endpoint). `NewIssueForm` now fetches
  that pool **once on mount** and shares it with both the picker and the per-slot
  dropdowns; `CandidateCurator` became **presentational** (receives the data as props),
  per the container/presentational split.
- Selection logic is the pure, tested `pickFirstUnused(items, usedUrls)` in the curate
  module, exposed to the client via a new client-safe **`@digest/curation/curate`**
  subpath export (the barrel pulls in server-only deps and must not enter the client
  bundle — same reasoning as `@digest/delivery/issue-status`).
