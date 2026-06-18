# ADR-0003 — Modular ingestion, radar integration, editorial design

**Status:** Accepted · **Date:** 2026-06-18 · **Branch:** `feat/radar-integration-editorial`

## Context

Curated AI Digest's news ingestion hard-wires two sources (RSS + Exa) inside `runIngest()`.
We want it **modular** so we can plug in additional source providers — in particular a
**"radar"** source like [`ekaynac/onprem-ai-adoption-radar`](https://github.com/ekaynac/onprem-ai-adoption-radar),
a deterministic (rule-based, LLM-optional) topic radar that already wears the Mega brand
and publishes machine-readable outputs (`data/history.jsonl`, JSON + Atom change feeds,
ring decision-cards). The radar and Curated AI Digest are meant to read as **two parts of one
system**.

## Decisions

1. **Pluggable `SourceProvider` interface.** `runIngest()` iterates a configurable list of
   providers instead of calling RSS/Exa directly. Built-ins: `rss`, `exa`. New: `radar`.
   Each provider: `{ id, label, fetch(opts): Promise<{ candidates: RawCandidate[]; errors: SourceError[] }> }`.
   Per-provider failure is isolated (never aborts the run). Provider set is config-driven.

2. **Radar source provider.** Pulls a radar's **JSON change feed** (and/or `history.jsonl`)
   over HTTP, maps ring decisions/changes → `RawCandidate[]` (title = project + ring/move,
   sourceUrl = per-project page, sourceName = the radar, excerpt = score/evidence summary).
   Works against `onprem-ai-adoption-radar` or any radar exposing the same JSON contract.
   Configured by a base URL + topic; deterministic, no LLM.

3. **Topic is configurable; default = "on-prem & enterprise AI workflows."** Stored in
   Settings; threaded into curation prompts + provider queries. Curated AI Digest stays a general
   AI digest but ships tuned toward enterprise/on-prem to pair with the radar out of the box.

4. **Brand blue aligns to the radar's `#009FDA`.** Adopt the radar's exact Process Blue as
   our primary token so Curated AI Digest stays visually consistent with a paired radar (was
   `#0089CF`). Re-key the logo PNGs to match if the hue drift is visible. Cool Gray / Black /
   Buka dot-pattern unchanged.

5. **Editorial design via Open Design.** Use the Open Design MCP (`web-artifacts-builder` /
   editorial skills) to author a bold editorial design that echoes the radar's visual
   language — hero, ring/badge pills, decision-card aesthetic, dot-pattern, movers/trend
   arrows, light+dark — then port into the Next.js dashboard + React Email. Email headers/
   footers feature the Buka chameleon + prominent branding.

6. **Our own deterministic radar = RFC + scaffold this round.** Document the design (an RFC/
   ADR) and lay a package scaffold; full build is a later effort. The on-prem radar is the
   reference implementation and the immediate integration target.

## Staged plan (subagent-driven; documented + committed per stage)

- **S1 Research** (parallel, read-only): map the radar's (a) JSON feed/data contract, (b)
  design language (tokens, components, light+dark). → findings docs.
- **S2 Modular ingestion**: `SourceProvider` refactor + register rss/exa + topic config. Tests.
- **S3 Radar provider**: `radar` provider against the JSON contract from S1. Tests.
- **S4 Brand alignment**: tokens → `#009FDA`; re-key logos if needed.
- **S5 Editorial design** (Open Design): generate + port to dashboard; echo the radar.
- **S6 Email redesign**: editorial template, Buka chameleon + branding in header/footer.
- **S7 Own-radar RFC + scaffold**: `docs/RFC-001-mega-radar.md` + `packages/radar` skeleton.
- **S8 Verify**: type-check, tests, build, e2e/visual; commit + PR.

## Consequences

- Adding a source = implement one `SourceProvider`; no orchestrator changes.
- Curated AI Digest can consume the radar today and our own radar later via the same contract.
- Visual unity with the radar; brand-guide hue shifts slightly (`#0089CF`→`#009FDA`).
