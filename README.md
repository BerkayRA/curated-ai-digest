# Mega Bülten

**A self-hosted, Claude-powered system that curates, writes, brands, and sends a weekly Turkish AI-news digest — with a human approval gate by default and guarded auto-send for holidays.**

![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Tests](https://img.shields.io/badge/tests-512%20passing-brightgreen)
![Build](https://img.shields.io/badge/build-passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

Mega Bülten is the **editorial sibling** of the
[On-Prem AI Adoption Radar](https://github.com/ekaynac/onprem-ai-adoption-radar). The radar makes
*decisions* (adopt / pilot / watch / avoid) about AI tooling; Mega Bülten turns the week's AI news —
including the radar's own ring changes — into a **branded, marketing-grade Turkish newsletter** that
goes out to customers and prospects. Both products share one **Mega design standard** (Process Blue
hero, Buka dot-dissolve motif, light + dark), so they read as two parts of one system.

Claude agents pick the 2–3 most important items each week, write Turkish copy in Mega's brand voice,
fact-check it against the sources, and render a branded HTML email. A dashboard owns the archive,
draft review/approval, live preview, subscriber management, and settings. The default flow keeps a
human in the loop (`draft → in_review → approved → scheduled → sent`); a guarded toggle enables
fully automated auto-send.

---

## Why

A company that sells AI to its customers should *look* like it lives and breathes AI — without a
person manually hunting for stories and writing the newsletter every single week. Mega Bülten
automates the hunting, ranking, writing, fact-checking, and rendering, then hands a finished draft to
a human for a one-click approve-and-send. It is **self-hosted** (the same Docker topology as the rest
of Mega's infra), **provider-agnostic** for email delivery, and **modular** in how it ingests news —
so a new source (or a second radar on a new topic) is a configuration change, not a rewrite.

## Features

- 🤖 **Cost-routed Claude curation pipeline** — five resumable stages (rank → curate → copywrite →
  editor/QA → render). Cheaper models do the bulk ranking; the strongest model curates, writes
  Turkish marketing copy, and runs a fact-check + brand-voice QA pass that loops back to the
  copywriter on flags. Every stage records its model, tokens, and USD cost for budget control.
- 🔌 **Modular `SourceProvider` ingestion** — `runIngest()` iterates a config-driven list of
  providers instead of hard-wiring sources. Built-ins: **RSS** (curated feeds) and **Exa** (neural
  search). A **radar** provider consumes the on-prem AI Adoption Radar's `history.jsonl` / change
  feed and maps ring decisions into newsletter candidates. Per-provider failure is isolated and
  never aborts a run.
- ✅ **Approval workflow + auto-send** — a guarded state machine
  (`draft → in_review → approved → scheduled → sent`, plus `cancelled` / `failed`). Auto-send skips
  the human gate **only** when every guardrail clears (curated items present, QA flags clear,
  provider config verified, subscriber count in bounds, kill-switch off); otherwise it falls back to
  a draft and alerts. Every transition writes an `AuditLog` row.
- 🎨 **Branded email** — React Email templates rendering Outlook-safe HTML with the Buka chameleon
  dot-dissolve motif, Process Blue band, and the Mega wordmark as an image asset (never re-typed in a
  font).
- 🖥️ **Dashboard** — Next.js App Router UI for the issue archive, a draft editor with live preview,
  subscriber CRUD + CSV import, settings, and approve/send actions.
- 🔌 **Pluggable `EmailProvider`** — **Azure Communication Services Email** (default), **Microsoft
  Graph**, and **Resend**, all behind one interface with a rate-limiter + retry/backoff wrapper.
  Switching provider is config-only (`Settings.activeProvider`).
- 🔐 **Microsoft Entra ID SSO** — tenant- and group-restricted dashboard auth (Auth.js Entra
  provider) behind an `AuthProvider` seam, with an argon2 local fallback for development.
- 🐳 **Self-hosted** — Docker Compose runs Postgres + the Next.js web app + the worker; no managed
  cloud service is required to operate the newsletter.

## Architecture

pnpm + Turborepo monorepo, self-hosted via Docker Compose. Two runtimes share Prisma + Zod contracts:
**`apps/web`** (dashboard + admin API) and **`apps/worker`** (scheduler + curation pipeline). See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full module map and invariants.

```
            ┌───────────────────────────────────────────────┐
            │                  Postgres (db)                 │
            └───────────────▲───────────────────▲────────────┘
                            │ Prisma            │ Prisma
        ┌───────────────────┴──────┐   ┌────────┴────────────────────┐
        │        apps/web          │   │        apps/worker           │
        │  dashboard + admin API   │   │  scheduler + pipeline runner │
        │  Entra SSO, preview,     │   │  ingest→rank→curate→write→QA │
        │  approve/send actions    │   │  →render→draft; scheduled send│
        └──────────┬───────────────┘   └───────┬──────────────────────┘
                   │ packages/email             │ packages/{curation,email,shared,db,brand,radar}
                   ▼                            ▼
        EmailProvider (ACS default · Graph · Resend)
```

The curation pipeline (in `apps/worker`):

```
Ingest (SourceProviders: RSS + Exa + radar; canonicalize + dedup by contentHash)
  → Stage 1 RANK      (cheaper model) relevance + importance scoring
  → Stage 2 CURATE    (strongest)     pick top 2–3, diversity, dedupe near-dupes
  → Stage 3 COPYWRITE (strongest)     Turkish marketing summaries + subject + preheader
  → Stage 4 EDITOR/QA (strongest)     fact-check vs source, TR grammar/tone, brand voice → qaFlags
                                      (retry loop back to Stage 3, max N)
  → Stage 5 RENDER    (—)             React Email → branded HTML
  → create Issue(draft) → approval gate OR guarded auto-send
```

## Quick start

Requires **Node ≥ 20**, **pnpm 10**, and **Docker** (for Postgres).

```bash
git clone https://github.com/megabilgisayar/mega-bulten.git
cd mega-bulten

pnpm install
pnpm db:up          # Postgres (+ Adminer in the dev profile) on host port 5433
pnpm db:migrate
pnpm db:seed
pnpm dev            # web (http://localhost:3100) + worker
```

Copy `.env.example` to `.env` and fill in secrets before running the worker pipeline:

- `ANTHROPIC_API_KEY` — Claude (curation pipeline)
- `EXA_API_KEY` — Exa neural search (the `exa` source provider)
- `ACS_CONNECTION_STRING` + `ACS_SENDER_ADDRESS` — Azure Communication Services Email (default
  delivery provider)
- `AUTH_SECRET` + the `AUTH_MICROSOFT_ENTRA_ID_*` trio — Microsoft Entra ID SSO

For step-by-step production deployment (DNS/SPF/DKIM/DMARC, secret generation, Entra app
registration, first-run checklist, weekly operation), follow [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

## Configuration

Runtime configuration lives in `.env` (see [`.env.example`](.env.example)) plus the `Settings` row
edited from the dashboard.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection (`db:5432` in Compose; `localhost:5433` from the host). |
| `ANTHROPIC_API_KEY` | Claude API key for the curation pipeline. |
| `EXA_API_KEY` | Exa neural-search key for the `exa` source provider. |
| `AUTH_SECRET` | Auth.js session secret (`openssl rand -base64 32`). |
| `AUTH_MICROSOFT_ENTRA_ID_ID` / `_SECRET` / `_TENANT_ID` | Entra ID OAuth app for SSO. |
| `ACS_CONNECTION_STRING` / `ACS_SENDER_ADDRESS` | Azure Communication Services (default email provider). |
| `GRAPH_*` / `RESEND_*` | Alternate email providers (commented out by default). |
| `APP_BASE_URL` | Public URL used for email links, approval URLs, and the same-origin CSRF check. |
| `AUTOSEND_ENABLED` | `true` lets the worker send without human approval (kill-switch in Settings overrides at runtime). |
| `AUTOSEND_MAX_SUBSCRIBERS` | Maximum subscriber count allowed for an unattended auto-send. |

**News topic & the radar source provider** are configured from the dashboard `Settings`. The topic
defaults to *"on-prem & enterprise AI workflows"* (threaded into curation prompts and provider
queries) so Mega Bülten pairs with the radar out of the box. The radar provider is toggled with
`RADAR_ENABLED` and pointed at any radar exposing the same machine-readable contract via
`RADAR_FEED_URL` (defaults to the on-prem radar's committed `history.jsonl`). See
[`docs/RADAR-DATA-CONTRACT.md`](docs/RADAR-DATA-CONTRACT.md) for the feed shape.

## Project structure

```
apps/
  web/        Next.js (App Router) — dashboard + admin API (Route Handlers / Server Actions)
  worker/     Node service — croner scheduler + weekly curation pipeline + scheduled sends
packages/
  shared/     Zod schemas, enums, DTOs — single source of truth for the data/wire contract
  db/         Prisma schema, generated client, migrations, seed
  curation/   Claude agent pipeline stages (cost-routed) + modular SourceProviders (rss/exa/radar)
  email/      React Email templates + the pluggable EmailProvider interface (ACS / Graph / Resend)
  delivery/   Dispatch service: rate-limit + retry/backoff, batch send, PII-scrubbed send records
  brand/      Design tokens (CSS custom properties), Buka/logo assets, font wiring
  radar/      @mega-bulten/radar — RFC-001 scaffold for an LLM-optional, topic-configurable radar
docs/         PRD, ARCHITECTURE, BRAND, BUILD_PLAN, RUNBOOK, SECURITY, ADRs, RFC-001, radar findings
```

## Documentation

- [`docs/PRD.md`](docs/PRD.md) — product requirements, scope, success criteria
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system overview, packages, pipeline, guardrails
- [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md) — phased, subagent-driven build plan + status
- [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — production deployment and weekly operation
- [`docs/BRAND.md`](docs/BRAND.md) — the Mega design standard (palette, Buka motif, wordmark rules)
- [`docs/RADAR-DESIGN-LANGUAGE.md`](docs/RADAR-DESIGN-LANGUAGE.md) — how the UI echoes the radar's system
- [`docs/RADAR-DATA-CONTRACT.md`](docs/RADAR-DATA-CONTRACT.md) — the radar feed the `radar` provider consumes
- [`docs/SECURITY.md`](docs/SECURITY.md) — applied security fixes and deferred items (internal audit)
- [`docs/RFC-001-mega-radar.md`](docs/RFC-001-mega-radar.md) — design for our own deterministic radar (`@mega-bulten/radar`)
- ADRs: [stack & architecture](docs/adr/ADR-0001-stack-and-architecture.md) ·
  [typography](docs/adr/ADR-0002-typography.md) ·
  [modular ingestion, radar & editorial](docs/adr/ADR-0003-modular-ingestion-radar-and-editorial.md)

## Development

```bash
pnpm install
pnpm type-check     # tsc --noEmit across every workspace
pnpm test           # Vitest unit/integration suites (512 passing)
pnpm test:e2e       # Playwright E2E + visual + axe a11y
pnpm build          # turbo build (web standalone + worker)
pnpm format         # prettier
```

Conventions: TypeScript everywhere (strict, no `any`), Zod contracts in `packages/shared` as the
single source of truth, immutable data flow, many small focused modules, and test-driven development.
See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for the setup,
workspace layout, coding conventions, the test bar, and PR expectations, and abide by the
[Code of Conduct](CODE_OF_CONDUCT.md). Security reports should follow [SECURITY.md](SECURITY.md).

## Author

Built by **Berkay Adanalı** — Software Engineer at
[Mega Bilgisayar Tic. Ltd. Şti](https://megabilgisayar.com.tr).

## License

Released under the **[MIT License](LICENSE)** — © 2026 Berkay Adanalı. Free to use, modify, and
distribute; keep the copyright notice.
