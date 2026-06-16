# Mega Bülten

Weekly **AI-news digest newsletter** system for **Mega Bilişim Teknolojileri**.

Claude-powered agents curate 2–3 important AI-news items each week, write Turkish
marketing-grade copy in Mega's brand voice, and render a branded HTML email featuring the
"Buka" chameleon dot-dissolve motif. A dashboard handles the archive, draft review/approval,
live preview, subscriber management, and settings. Default flow is human-in-the-loop
(`draft → in_review → approved → scheduled → sent`); a guarded toggle enables fully automated
auto-send for holidays.

## Architecture

pnpm + Turborepo monorepo, self-hosted via Docker Compose.

```
apps/
  web/        Next.js (App Router) — dashboard + admin API (Route Handlers)
  worker/     Node service — weekly curation pipeline + scheduler
packages/
  shared/     Zod schemas, enums, DTOs (the data/wire contract)
  db/         Prisma schema, client, migrations, seed
  curation/   Claude agent pipeline (ingest → rank → curate → copywrite → QA → render)
  email/      React Email templates + pluggable EmailProvider (ACS / Graph / Resend)
  brand/      Design tokens (CSS custom properties), Buka/logo assets, fonts
docs/         PRD, ARCHITECTURE, BRAND, BUILD_PLAN, ADRs
```

## Stack

- TypeScript everywhere · Next.js App Router · Node worker
- PostgreSQL + Prisma · Zod contracts in `packages/shared`
- Claude API (cost-routed) · Exa + RSS ingestion
- React Email · Azure Communication Services Email (default, pluggable)
- Microsoft Entra ID SSO (dashboard auth)
- Docker Compose · Vitest · Playwright

## Quick start

```bash
pnpm install
pnpm db:up          # Postgres + Adminer
pnpm db:migrate
pnpm db:seed
pnpm dev            # web + worker
```

Copy `.env.example` to `.env` and fill in secrets (Anthropic, Exa, ACS, Entra) before
running the worker pipeline.

## Brand

Process Blue `#0089CF` · Cool Gray 3 `#C8C9C7` · Black `#1A1A1A`. Buka chameleon mascot +
dot-particle dissolve motif. See [`docs/BRAND.md`](docs/BRAND.md). The `mega` wordmark is
always an image asset (never re-typed in a font).
