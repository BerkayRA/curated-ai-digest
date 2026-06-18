# Radar Data Contract — `ekaynac/onprem-ai-adoption-radar`

> Source of truth for the `radar` SourceProvider (S3). Mapped from repo `main` by the
> S1 research workflow (2026-06-18). Field names are verbatim from the radar's source.

## Pollable HTTP feeds (no Python required)

The radar's rich **DecisionCards are NOT published as JSON** (only via its CLI/stdio-MCP).
Over plain HTTP we consume **ring-change events**:

| Feed | URL | Notes |
|---|---|---|
| **`history.jsonl`** (recommended default) | `https://raw.githubusercontent.com/ekaynac/onprem-ai-adoption-radar/main/data/history.jsonl` | Append-only JSON Lines, oldest-first, **committed daily** → always fresh, no Pages needed. THE primary feed. |
| `changes.json` | `<siteRoot>/changes.json` | JSON Feed 1.1, newest **50** events. Static-export only (not on `serve`). Use if a Pages site URL is configured. |
| `changes.xml` | `<siteRoot>/changes.xml` | Atom; same 50; prefer `changes.json` for machine parsing. |

`<siteRoot>` (GitHub Pages base) is **not confirmed** in the repo → default to the raw
`history.jsonl` URL; allow a configurable `siteRoot` for deep links / changes.json.

### `history.jsonl` record (`ProjectHistoryEvent`) — verbatim fields

```json
{"project":"vLLM","category":"model_serving","change_type":"demoted","ring":"pilot",
 "previous_ring":"adopt","run_id":"run-20260615T073452Z-ab5d0a59",
 "observed_at":"2026-06-15T07:36:02.282606Z",
 "reasons":["Ring moved adopt -> pilot.","This release features 408 commits ...","..."]}
```

| Field | Type | Notes |
|---|---|---|
| `project` | string | display name |
| `category` | enum | see categories below |
| `change_type` | enum | `new` \| `promoted` \| `demoted` \| `updated` |
| `ring` | enum | `adopt` \| `pilot` \| `watch` \| `avoid` |
| `previous_ring` | enum \| null | null for `new` |
| `run_id` | string | scan id |
| `observed_at` | ISO-8601 UTC | |
| `reasons` | string[] | first line = ring-move sentence; rest = real release-note highlights |

### `changes.json` item: `{ id:"{run_id}:{project}:{change_type}", title, content_text:reasons.join(" "), date_published:observed_at, tags:[category, ring] }`

## Enums (verbatim)

- **Rings** (rank): `avoid`(0) < `watch`(1) < `pilot`(2) < `adopt`(3)
- **change_type**: `new` · `promoted` · `demoted` · `updated`
- **trend** (cards only, NOT in feed): `rising` · `falling` · `steady` → infer from change_type over HTTP
- **categories** (9): `coding_agents` · `general_agents` · `mcp_tooling` · `sandbox_governance` · `agent_frameworks` · `model_serving` · `ai_infrastructure` · `physical_ai_infrastructure` · `fun_experimental`
- **backer types** (cards only): `big_tech`🏢 · `startup`🚀 · `community`🌐 · `individual`👤 · `academic`🎓

## Candidate mapping (`ProjectHistoryEvent` → `RawCandidate`)

| RawCandidate | Expression |
|---|---|
| `title` | `` `${project}: ${previous_ring ?? 'new'} → ${ring} (${change_type})` `` (for `new`: `` `${project}: new on the radar (${ring})` ``) |
| `sourceUrl` | `` `${siteRoot}/project_${slug(project)}.html` `` if siteRoot set, else the radar repo URL. **No canonical article URL exists in the feed** — document this. |
| `sourceName` | `"On-Prem AI Adoption Radar"` (optionally + category) |
| `rawExcerpt` | `reasons.join(' ')` |
| `publishedAt` | `observed_at` |
| stable id (dedupe) | `` `${run_id}:${project}:${change_type}` `` |

`slug(name)` = lowercase, non-`[a-z0-9]` runs → `-` (e.g. `llama.cpp` → `llama-cpp`).

## Filtering (provider config)

- **category**: keep events whose `category` ∈ configured set (default: all on-prem-relevant).
- **ring / change_type**: prefer `change_type ∈ {new, promoted, demoted}` (real movement);
  `updated` is lower-signal. "Try this week" ≈ `ring ∈ {adopt, pilot}`.
- **topic allowlist**: mirror `config/seed-sources.yaml` project/category list if needed.
- Cold start: read full `history.jsonl` to seed dedupe state, then incrementally tail.

## `seed-sources.yaml` schema (to mirror topic/source config)

```yaml
version: "1.0"
sources:
  - id: github-vllm            # required unique
    type: github_repo          # github_repo | rss | manual
    enabled: true
    project: vLLM              # required
    category: model_serving    # required (9 enum)
    url: https://github.com/vllm-project/vllm   # required http(s)
    tags: [model-serving, on-prem-relevant]
    package: {ecosystem: PyPI, name: vllm}      # optional
    backer: {name: "...", type: community}       # optional
    firehose: true             # optional (rss broad feed reclassified)
    aliases: [vllm]            # optional match strings
```

(`extra: forbid` — unknown keys rejected. 7 score dimensions: workflow_impact,
laptop_runnability, open_source_maturity, on_prem_relevance, security_posture,
demo_value, setup_friction.)

## Caveats

- Pages base URL unconfirmed → default to raw `history.jsonl`.
- `backer`, `trend`, `score`, `evidence` URLs are card-only — unreachable over HTTP.
- No per-article URL in the feed; `reasons[]` is the only body text available.
