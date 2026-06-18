# RFC-001 — Mega Radar: an LLM-optional, topic-configurable deterministic news radar

**Status:** Draft (scaffold-only this round) · **Date:** 2026-06-18 · **Owner:** Mega Bülten
**Relates to:** [ADR-0003](adr/ADR-0003-modular-ingestion-radar-and-editorial.md) decision 6,
[RADAR-DATA-CONTRACT.md](RADAR-DATA-CONTRACT.md), `packages/curation/src/ingest/radar-source.ts`

> This RFC documents the design of **Mega Radar** (`@mega-bulten/radar`). This round delivers
> the **design doc + a compiling package scaffold** only. The reference implementation is
> [`ekaynac/onprem-ai-adoption-radar`](https://github.com/ekaynac/onprem-ai-adoption-radar); we
> mirror its concepts and **exactly** its machine-readable output contract so the rest of Mega
> Bülten can consume our radar with no code changes (see "Plugging back in").

---

## 1. Motivation

Mega Bülten already integrates with an **external** radar (the on-prem AI adoption radar) via the
`radar` `SourceProvider` (ADR-0003 decisions 1–2). That radar is great, but it is:

- **Single-topic** — hard-wired to "on-prem & enterprise AI workflows."
- **Externally owned** — we do not control its cadence, scope, or hosting.
- **Not ours to brand or re-point** at adjacent topics (e.g. "data engineering tooling",
  "Turkish public-sector IT", "security tooling") that future Mega Bülten editions may want.

We want to **own a radar** that is:

1. **Deterministic by default.** Rule-based collection → normalization → scoring → ring
   classification. No LLM in the hot path. Reproducible: same inputs → same `history.jsonl`.
2. **Self-hostable.** Runs as a cron/worker job inside our own infra (the same Docker topology
   as the rest of Mega Bülten). No third-party runtime dependency.
3. **Topic-configurable.** One `radar.config.yaml` defines the topic, the seed sources, the
   category set, quotas, and scoring weights. Spinning up a second radar for a new topic is a
   config file, not a fork.
4. **LLM strictly optional, off by default.** An optional second pass can disambiguate the
   low-confidence tail, but the radar is fully functional — and shippable to air-gapped /
   cost-sensitive customers — with the LLM disabled.
5. **Contract-compatible with what we already consume.** It emits the **same** `history.jsonl`
   and `changes.json` shapes defined in [RADAR-DATA-CONTRACT.md](RADAR-DATA-CONTRACT.md), so the
   existing `radarProvider` in `@mega-bulten/curation` ingests our radar by **only** changing a
   feed URL.

Non-goals (this round): a real collector network, a real scoring model, a UI, or hosting. Those
are later phases. This round = RFC + scaffold that **compiles and type-checks**.

---

## 2. Topic-config model (`radar.config.yaml`)

The config mirrors the reference radar's `config/seed-sources.yaml` schema (see the data-contract
doc) and **extends** it with a `topic`, category **quotas**, and the **7 scoring-dimension
weights**. Unknown keys are rejected (`extra: forbid` equivalent — Zod `.strict()`).

```yaml
version: '1.0'

# The editorial subject this radar tracks. Threaded into deep-link copy, the
# emitted feed metadata, and (when enabled) the optional LLM prompt context.
topic: 'on-prem & enterprise AI workflows'

# Seed sources — verbatim mirror of seed-sources.yaml, one entry per tracked project.
sources:
  - id: github-vllm # required, unique
    type: github_repo # github_repo | rss | manual
    enabled: true
    project: vLLM # required (display name)
    category: model_serving # required (one of the 9 categories)
    url: https://github.com/vllm-project/vllm # required http(s)
    tags: [model-serving, on-prem-relevant] # optional
    package: { ecosystem: PyPI, name: vllm } # optional registry pointer
    backer: { name: 'vLLM Project', type: community } # optional
    firehose: false # optional (broad RSS feed, reclassified per-item)
    aliases: [vllm] # optional match strings for dedupe/reclassification

# Per-category caps applied at ring-classification time (after scoring).
# Caps the number of projects allowed in each ring per category so one category
# cannot dominate "adopt". Omitted categories default to `defaultQuota`.
quotas:
  defaultQuota: 8
  byCategory:
    model_serving: 10
    coding_agents: 12

# Relative weights for the 7 scoring dimensions. Normalized to sum to 1 at load
# time; a signal's composite score is the weighted sum of its per-dimension
# scores (each 0..1). This is the only knob that changes "what we value".
scoring:
  weights:
    workflow_impact: 0.22
    laptop_runnability: 0.10
    open_source_maturity: 0.16
    on_prem_relevance: 0.20
    security_posture: 0.12
    demo_value: 0.08
    setup_friction: 0.12 # note: friction is scored as "low friction = high score"

# Absolute gates + relative promotion thresholds for ring classification.
rings:
  gates: # a signal must clear ALL listed minimums for the ring
    adopt: { minScore: 0.78, minOpenSourceMaturity: 0.6, minSecurityPosture: 0.5 }
    pilot: { minScore: 0.6 }
    watch: { minScore: 0.4 }
    # below `watch.minScore` ⇒ `avoid`
  promotion:
    # A signal scoring within `band` of the next ring's gate AND ranking in the
    # top `topFraction` of its category may be promoted one ring. Deterministic.
    band: 0.04
    topFraction: 0.25

# Optional LLM second pass — OFF by default.
llm:
  enabled: false # deterministic-only when false; nothing else here is read
  mode: tiebreak_only # tiebreak_only | rescore_tail
  # Only signals whose composite score lands within this band of a ring gate are
  # eligible for the LLM pass; everything else stays purely deterministic.
  ambiguityBand: 0.03
  maxCalls: 20 # hard cap per run (cost ceiling)
```

### Config rules

- `weights` are **normalized** at load (sum→1) so authors can write any positive numbers.
- `setup_friction` is documented to be scored **inverted** (low friction ⇒ high dimension score)
  so all 7 dimensions are "higher is better" and the weighted sum needs no special-casing.
- `sources[].category` and `quotas.byCategory` keys are constrained to the **9 categories**
  (verbatim from the data contract) so a typo fails validation rather than silently dropping.
- The whole document is validated with a **strict** Zod schema; unknown keys throw.

---

## 3. Deterministic pipeline

```
 collect ──► normalize ──► score ──► ring-classify ──► emit
 (GitHub,    (one RawSignal  (7 dims, (gates + quotas    (history.jsonl
  registries, per project,    weighted  + relative         + changes.json,
  RSS)        deduped)        sum)      promotion)          contract-shaped)
                                               │
                                  (optional) LLM second pass
                                   on the ambiguous tail only
```

### 3.1 Collect

Deterministic collectors, **no LLM**, each isolating its own per-source failures (same discipline
as the `SourceProvider` contract):

- **GitHub releases / activity** (`github_repo` sources): latest release tag, release-note body,
  commit count since previous tracked release, stars, last-push recency. Drives
  `open_source_maturity`, `demo_value` (release-note highlights), and freshness.
- **Package registries** (`package` pointers): PyPI / npm / crates download counts, latest
  version, version cadence. Drives `open_source_maturity` and `laptop_runnability`
  (is it `pip install`-able / single-binary?).
- **RSS / Atom** (`rss` sources, incl. `firehose: true`): broad feeds reclassified per-item
  against `aliases`/`tags`. Drives discovery of `new` projects and `workflow_impact` evidence.

Each collector returns `RawSignal[]` (one per project per run) and `SourceError[]`. Failures are
non-fatal — a dead collector degrades the run, it does not abort it.

### 3.2 Normalize

Merge multi-collector signals for the same project (matched by `id` + `aliases`) into a single
`RawSignal`, attach the previous run's ring (for change detection), and stamp `runId` +
`observedAt`.

### 3.3 Score (pure, deterministic)

`scoreSignal(signal, weights): ScoredSignal` produces a `scores: Record<Dimension, number>` map
over the **7 dimensions** and a composite `score` = normalized weighted sum:

| Dimension | What it measures | Primary inputs |
|---|---|---|
| `workflow_impact` | Does it change a real day-to-day workflow? | RSS/release evidence, category prior |
| `laptop_runnability` | Can a dev run it on a laptop? | binary/install footprint, package size |
| `open_source_maturity` | License, release cadence, contributor base | GitHub + registry |
| `on_prem_relevance` | Self-hostable / air-gappable? | tags, license, deployment model |
| `security_posture` | Supply-chain & CVE posture | advisories, signed releases, backer type |
| `demo_value` | Is there something to *show* this week? | release-note highlights, recency |
| `setup_friction` | Inverted: low friction ⇒ high score | install steps, deps, runtime reqs |

The function is **pure** — no I/O, no clock, no randomness — so it is trivially unit-testable and
reproducible. (The scaffold ships a documented simple default; the real heuristics are TODO.)

### 3.4 Ring-classify (absolute gates + relative promotion + quotas)

`classifyRing(score, gates): Ring`:

1. **Absolute gate.** Walk rings high→low (`adopt`→`pilot`→`watch`); assign the highest ring whose
   gate the signal clears (composite `minScore` plus any per-dimension floors). Below
   `watch.minScore` ⇒ `avoid`.
2. **Relative promotion.** A signal within `promotion.band` of the next ring's gate **and** in the
   top `promotion.topFraction` of its category may be promoted exactly one ring. Fully
   deterministic given the run's signal set.
3. **Quotas.** Apply per-category caps from `quotas`; lowest-scoring overflow in a ring spills
   down one ring. Stable, deterministic ordering (score desc, then `id` asc as tiebreak).

Then **change detection**: compare each project's new ring to its previous ring to emit a
`change_type` (`new` / `promoted` / `demoted` / `updated`).

### 3.5 Emit (contract-shaped — implemented for real in the scaffold)

`toHistoryJsonl(events)` and `toChangesJson(events)` serialize `RadarEvent[]` into the **exact**
`history.jsonl` and `changes.json` shapes from the data contract (snake_case fields:
`change_type`, `previous_ring`, `run_id`, `observed_at`). These two serializers are simple and
**fully implemented + tested** this round (they are the contract surface that makes the radar
consumable today).

---

## 4. Collectors (deterministic, no LLM)

| Collector | Source type | Determinism notes |
|---|---|---|
| `GithubReleasesCollector` | `github_repo` | GitHub REST; pin to a tag/sha window; cache by ETag |
| `PackageRegistryCollector` | `package` | PyPI/npm/crates JSON APIs; download counts are point-in-time → snapshot in the run record |
| `RssCollector` | `rss` (+ `firehose`) | reuse `@mega-bulten/curation`'s `parseFeedXml`; reclassify firehose items via `aliases`/`tags` |

All collectors implement the `Collector` interface (scaffolded in `types.ts`). They never call an
LLM and never throw out of `collect()` — per-item failures become `SourceError`s.

---

## 5. Optional LLM second pass (off by default)

When `llm.enabled: true`, a single second pass runs **only** over signals whose composite score is
within `llm.ambiguityBand` of a ring gate (the genuinely ambiguous tail), capped at
`llm.maxCalls`. Modes:

- `tiebreak_only` — the model may nudge a signal up/down **one** ring with a one-line reason; it
  cannot invent scores. The deterministic result is the prior.
- `rescore_tail` — the model proposes per-dimension scores for tail signals, which are then run
  back through the **same** deterministic `classifyRing`.

Guarantees: with `enabled: false` the LLM code path is never imported/invoked; the run is
byte-reproducible. The model can never bypass gates or quotas — it only perturbs the tail, then
the deterministic classifier has the final say. This keeps the radar shippable to air-gapped and
cost-sensitive deployments.

---

## 6. Plugging back into Mega Bülten

Mega Bülten **already** has a `radar` `SourceProvider`
(`packages/curation/src/ingest/radar-source.ts`) that reads the `history.jsonl` / `changes.json`
contract. Because Mega Radar emits the **same** contract:

```ts
// No code change — just re-point the feed URL at our own radar's output.
import { createRadarProvider } from '@mega-bulten/curation';

const megaRadar = createRadarProvider({
  feedUrl: 'https://radar.mega.internal/data/history.jsonl', // our radar
  siteRoot: 'https://radar.mega.internal',
});
```

`@mega-bulten/radar` itself depends on **nothing** from `curation`; the coupling is one-directional
and purely through the on-disk/HTTP contract. The radar can be hosted independently, and
`curation` consumes it like any other radar. (Field-name parity is enforced by the emit round-trip
test in this scaffold.)

---

## 7. Build phases

| Phase | Deliverable | Status |
|---|---|---|
| **P0** | RFC + scaffold (config schema, types, pure scoring/classify stubs, real emit + tests) | **this round** |
| **P1** | `RssCollector` (reuse `parseFeedXml`) + `GithubReleasesCollector`; real `RawSignal` shape end-to-end | next |
| **P2** | Real `scoreSignal` heuristics per dimension; `PackageRegistryCollector` | — |
| **P3** | Real `classifyRing` with gates + relative promotion + quotas + change detection; golden-file tests over `history.jsonl` | — |
| **P4** | Persistence (previous-run state), `runRadar` orchestrator wired, cron/worker + Docker hosting | — |
| **P5** | Optional LLM second pass behind `llm.enabled`; cost ceiling + eval | — |
| **P6** | Re-point a Mega Bülten edition at our own radar in staging; visual/feed parity check | — |

---

## 8. Risks

- **Determinism drift.** Registry download counts / GitHub stars are time-varying. *Mitigation:*
  snapshot raw inputs into the run record; scoring consumes the snapshot, not live APIs.
- **Contract drift vs. the reference radar.** If the upstream contract changes, our emit must
  follow. *Mitigation:* the emit round-trip test asserts exact field names against the
  data-contract doc; a single schema in `config.ts`/`types.ts` is the source of truth.
- **Scoring opinion is hard.** Heuristics will be wrong at first. *Mitigation:* weights live in
  config (tunable without code); golden-file tests in P3 lock behavior; the optional LLM pass
  absorbs the ambiguous tail.
- **Topic sprawl.** One radar per topic could multiply infra. *Mitigation:* radars are pure config
  over one codebase; share collectors, scoring, emit — only `radar.config.yaml` differs.
- **GitHub rate limits.** *Mitigation:* ETag caching, token auth, windowed polling, backoff.
- **LLM cost / leakage.** *Mitigation:* off by default, `ambiguityBand` gating, `maxCalls` hard
  cap, deterministic classifier remains authoritative.
