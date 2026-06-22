# Automation: CI + Daily News Scan

This project ships two GitHub Actions workflows plus a self-hosted-worker bridge.
Together they keep a **fresh pool of candidate news always ready** for the weekly
digest, without any paid API keys in CI and without exposing the self-hosted
database to the internet.

```
┌──────────────────────┐     commits      ┌───────────────────────┐
│  daily-scan.yml      │  data/candidates │   repo (main)         │
│  (GitHub-hosted)     │ ───────────────▶ │   data/candidates/    │
│  RSS + Radar, keyless│   [skip ci]      │   latest.jsonl        │
└──────────────────────┘                  └───────────┬───────────┘
                                                       │ checkout / pull
                                                       ▼
                                        ┌──────────────────────────────┐
                                        │  worker (self-hosted)         │
                                        │  importCommittedCandidates()  │
                                        │   → Postgres CandidateArticle │
                                        │  → runWeeklyPipeline (Claude)  │
                                        └──────────────────────────────┘
```

Why commit the pool to the repo instead of writing to a DB? GitHub-hosted
runners cannot reach the self-hosted Postgres, and the scan is deterministic and
keyless. Committing a versioned artifact (the same pattern the on-prem AI
adoption radar uses for its `history.jsonl`) needs no secrets, no exposed infra,
and gives an auditable, diff-able history of what was discovered each day.

---

## 1. CI — `.github/workflows/ci.yml`

Runs on every push to `main` and every pull request (`concurrency` cancels
superseded runs).

**Job `build`:**
1. `pnpm install --frozen-lockfile`
2. `pnpm --filter @digest/db generate` — the generated Prisma client is required
   for type-check/build across the workspace; `prisma generate` needs no database.
3. `pnpm turbo run build`, then `pnpm turbo run lint type-check test` — build runs
   first so web's `tsc` (which includes Next's generated `.next/types`) doesn't race
   a concurrent `next build`. ESLint is configured workspace-wide via the
   `eslintConfig` field in the root `package.json` (shared TS config) and
   `apps/web/package.json` (`next/core-web-vitals`).

**Job `e2e-smoke`** (`needs: build`, `continue-on-error: true` for now):
- Installs bundled Chromium (`playwright install --with-deps chromium`) and runs
  a single smoke spec (`apps/web/e2e/smoke.spec.js`) via
  `apps/web/playwright.smoke.config.cjs` — it boots `next dev`, loads `/login`,
  and asserts the `Hoş Geldiniz` heading and the Mega Bilgisayar logo are visible.
- It is intentionally **smoke-only**: the full Playwright suite includes
  visual-regression snapshots that are not baselined yet. Once snapshots are
  baselined (`pnpm --filter @digest/web test:e2e:update`), flip
  `continue-on-error` to `false` to make it a required gate.

No Postgres service container is needed — unit tests mock the database.

---

## 2. Daily scan — `.github/workflows/daily-scan.yml`

- **Schedule:** `cron: "0 2 * * *"` (02:00 UTC ≈ 05:00 Europe/Istanbul; Türkiye is
  UTC+3 year-round). Also `workflow_dispatch` for manual runs.
- **Permissions:** `contents: write` (to push the artifact commit), using the
  default `GITHUB_TOKEN` — no PAT.
- **Concurrency:** `group: daily-scan`, `cancel-in-progress: false` (never run two
  scans at once).
- **Steps:** install → `pnpm scan` (`SCAN_MAX_ITEMS=200`) → commit `data/candidates`
  back only if it changed, as `digest-scanner[bot]`, with
  `chore(scan): refresh candidate pool [skip ci]`.

The `[skip ci]` token stops the scan's own commit from re-triggering `ci.yml`
(no commit/CI loop). The scan path is **DB-free** (Prisma is lazy-loaded only for
database writes; the scan injects a file repository), so the job needs no
`prisma generate` and no Postgres.

### Scanner / feed defaults

| Source | Keyless? | In daily default? | Notes |
|---|---|---|---|
| **RSS** (`rss-source.ts`) | ✅ | ✅ | Curated feed list. |
| **Radar** (`radar-source.ts`) | ✅ | ✅ | Consumes the on-prem AI adoption radar's `history.jsonl`. |
| **Exa** (`exa-source.ts`) | ❌ (needs `EXA_API_KEY`) | ❌ | Opt-in only; not run in CI. |
| **Claude curation** (`runWeeklyPipeline`) | ❌ (needs `ANTHROPIC_API_KEY`) | ❌ | Weekly, in the self-hosted worker — never daily/CI. |

---

## 3. The candidate-pool artifact (`data/candidates/`)

Produced by `pnpm scan`, consumed by the worker. Two files:

### `latest.jsonl` — the rolling pool (NDJSON, one record per line)

Each line is a `StoredCandidate` (schema: `storedCandidateSchema` in
`packages/curation/src/ingest/candidate-file.ts`):

| Field | Type | Notes |
|---|---|---|
| `title` | string | |
| `sourceUrl` | string | canonical URL (also the dedup key) |
| `sourceName` | string | e.g. `On-Prem AI Adoption Radar` |
| `rawExcerpt` | string \| undefined | |
| `publishedAt` | string (ISO) \| null | |
| `canonicalUrl` | string | dedup key |
| `contentHash` | string | secondary dedup key |
| `firstSeenAt` | string (ISO) | preserved across runs for returning URLs |
| `ingestRunId` | string | the run that first added the record |

- **Dedup:** across runs by `canonicalUrl` (and `contentHash` within a run).
- **Rolling cap:** newest `SCAN_MAX_ITEMS` (default **200**) are kept; older ones
  drop off. Sorted by `publishedAt` desc (fallback `firstSeenAt`).

### `index.json` — run metadata

`{ lastRunId, generatedAt, source, errorsCount, poolSize, added }`.

---

## 4. The `pnpm scan` CLI

`pnpm scan` → `pnpm --filter @digest/curation scan` → `tsx src/bin/scan.ts`.

| Env var | Default | Purpose |
|---|---|---|
| `CANDIDATES_DIR` | `data/candidates` | Output dir, resolved against `INIT_CWD` (the dir `pnpm` was invoked from), so it always writes to the repo root even though pnpm runs the script in the package dir. |
| `SCAN_TOPIC` | `DEFAULT_TOPIC` | Topic threaded into providers (tunes queries). |
| `SCAN_MAX_ITEMS` | `200` | Rolling pool cap. |

Prints the `IngestResult` JSON to stdout; logs to stderr. Exits `0` on partial
per-source failures (they are isolated), `1` only if **zero** candidates were
fetched (all sources failed) or a write error occurred.

---

## 5. Consumption bridge (self-hosted worker)

Before each weekly curation, the worker calls
`importCommittedCandidates({ dir: process.env.CANDIDATES_DIR })`
(`apps/worker/src/jobs/curate.ts`). It reads `latest.jsonl`, Zod-validates each
record, maps to the ingest model, and **idempotently upserts** into Postgres
(`persistRun`, conflict on `canonicalUrl`). A missing or failed import is
non-fatal — the weekly run proceeds on whatever candidates the DB already holds.

> **Deployment:** point `CANDIDATES_DIR` at the committed pool inside the worker
> container (e.g. `CANDIDATES_DIR=/app/data/candidates`). Keep the checkout fresh
> (pull `main`, or rebuild the image) so the worker sees the latest commits from
> the daily scan.

The worker's existing weekly croner schedule is unchanged; the daily scan only
keeps the candidate pool fresh and complements it.

---

## Local usage

```bash
pnpm scan                      # run the scan, write data/candidates/
SCAN_MAX_ITEMS=50 pnpm scan    # smaller pool
```

To run the daily workflow manually on GitHub: **Actions → Daily news scan → Run
workflow**.

---

## 6. Manual curation without an API key

When you want to create a draft Issue without running the full Claude pipeline
(e.g. the operator reviews the pool and picks items by hand, or an LLM in the
loop produces the selection JSON directly), use the `curate:manual` CLI in
`apps/worker`.

### Step 1 — Review the live candidate pool

```bash
pnpm --filter @digest/worker curate:manual list
```

Flags:

| Flag | Example | Purpose |
|------|---------|---------|
| `--source <substr>` | `--source TechCrunch` | Filter by source name (case-insensitive) |
| `--limit <n>` | `--limit 10` | Show only the first n results |

Example:

```bash
pnpm --filter @digest/worker curate:manual list --limit 5
pnpm --filter @digest/worker curate:manual list --source "DeepMind" --limit 3
```

Output is grouped by source, with a stable index, title, URL, and excerpt for
each candidate. Logs go to stderr; the listing goes to stdout.

### Step 2 — Create the selection JSON

Copy `apps/worker/sample-selection.json` as a starting point and fill in the
Turkish copy. The shape:

```json
{
  "subject": "AI Digest: Samsung×OpenAI, Gemma 4 ve Anthropic'in Yeni Modeli",
  "preheader": "Bu hafta yapay zeka dünyasında üç önemli gelişme",
  "isoWeek": "2026-W25",
  "items": [
    {
      "titleTr": "Samsung ve OpenAI Stratejik Ortaklık Kurdu",
      "summaryTr": "Samsung Electronics, OpenAI ile çip entegrasyonu … ortaklık imzaladı.",
      "sourceUrl": "https://techcrunch.com/2026/samsung-openai-partnership",
      "sourceName": "TechCrunch"
    }
  ]
}
```

Rules:
- `subject` and `preheader` — non-empty strings.
- `isoWeek` — optional; omit to default to the current ISO week (`YYYY-Wnn`).
- `items` — array of **2 or 3** objects, each with non-empty `titleTr`,
  `summaryTr`, `sourceName`, and a valid `sourceUrl`.

### Step 3 — Persist the draft Issue

```bash
pnpm --filter @digest/worker curate:manual draft my-selection.json
```

On success the command prints a JSON line to stdout:

```json
{"issueId":"clxxxxx","isoWeek":"2026-W25","status":"draft"}
```

Logs (including any DB errors) go to stderr. Exit code is `0` on success, `1`
on validation or I/O errors. The Issue can then be reviewed and sent from the
web dashboard like any other draft.
