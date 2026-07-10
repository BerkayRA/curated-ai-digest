# DEPLOYMENT — Curated AI Digest (Vercel + Render)

> Companion to [`RUNBOOK.md`](./RUNBOOK.md) (env vars, secrets, Entra, email DNS) and
> [`ARCHITECTURE.md`](./ARCHITECTURE.md). This guide is the concrete hosting wiring:
> **local → staging → production** on **Vercel** (web) + **Render** (worker) + a managed
> **Postgres** (Neon or Render PostgreSQL).

## Architecture recap (what runs where)

| Component | Local | Staging / Production |
|---|---|---|
| Web (`apps/web`, Next.js 16 / Turbopack) | `localhost:3100` | **Vercel** (Next.js runtime) |
| Worker (`apps/worker`, croner scheduler) | `tsx watch` | **Render** — Background Worker (always-on) |
| Postgres 16 | Docker (`pnpm db:up`, `:5433`) | **Neon** (serverless) or **Render PostgreSQL** |
| Prisma client | generated locally | generated at build on both Vercel + Render |

Two runtimes share **one database** and the `@digest/*` workspace packages:

- **Web** serves the Turkish admin dashboard (topics, sources, subscribers, issue approval) and
  hosts the on-demand curation route (`POST /api/issues/run-pipeline`) + the public archive/RSS.
- **Worker** is the always-on process: it loads `Settings` + active `Topic`s and registers **one
  croner pair per active topic** (pipeline lead + send), honoring the auto-send kill-switch.

> The worker is a *long-running* process, not a cron trigger — it must run on a service that stays
> up (Render Background Worker). Vercel's serverless functions cannot host it. Vercel Cron is an
> option only if you later refactor the scheduler into stateless HTTP handlers; today, use Render.

---

## Phase 1 — Local

Prereqs: Node ≥ 20, pnpm 10, Docker Desktop.

```bash
cp .env.example .env                       # fill DB + AUTH_SECRET + provider creds
pnpm install
pnpm db:up                                 # Postgres :5433 + Adminer :8080
pnpm --filter @digest/db generate          # prisma client
pnpm --filter @digest/db migrate           # apply migrations (dev)
pnpm --filter @digest/db seed              # Settings row + default `enterprise-ai` topic

pnpm dev                                   # web :3100  +  worker (tsx watch)
```

- Admin: <http://localhost:3100> — local auth `admin@megabilgisayar.com.tr` / `Test1234!`
  (set `AUTH_MODE=local`; see [`RUNBOOK.md §3.2`](./RUNBOOK.md) for the argon2 hash).
- The worker refuses to boot without a `Settings` row — always run the seed first.

### Credits-free curation for dev/test

Run the **entire** pipeline through your local Claude Code CLI instead of the metered API —
no `ANTHROPIC_API_KEY`, no per-token billing:

```bash
pnpm --filter @digest/worker pipeline:dev [--iso-week 2026-W29] [--no-ingest]
```

This uses the dev `AnthropicClient` (`createClaudeCodeClient`) which shells out to `claude -p`.
It is **dev/test only** — hard-blocked when `NODE_ENV=production` and never wired into the
scheduler. See [`ADR-0020`](./adr/ADR-0020-pluggable-llm-backends.md). The **human-as-LLM** path
(`pnpm --filter @digest/worker curate:manual`) remains the zero-cost, Claude-quality manual route.

---

## Phase 2 — Staging / Production

The steps are identical for staging and production — use two Vercel environments (Preview vs
Production) and two Render services + two databases. Provision **database first**, then worker,
then web (web reads `APP_BASE_URL` and provider creds that the others also need).

### 2.1 — Database → Neon (recommended) or Render PostgreSQL

**Neon** (serverless, generous free tier, scales to zero):

1. Create a project + database `curated_ai_digest`.
2. Copy the **pooled** connection string for the app runtime and the **direct** string for
   migrations. Append `?sslmode=require`.
3. Run migrations from your machine against the new DB (Prisma applies over SSL):

   ```bash
   DATABASE_URL="postgresql://…direct…?sslmode=require" pnpm --filter @digest/db migrate:deploy
   DATABASE_URL="postgresql://…direct…?sslmode=require" pnpm --filter @digest/db seed
   ```

> Use the **direct** (non-pooled) URL for `migrate:deploy` and seed; use the **pooled** URL for
> `DATABASE_URL` in the running web + worker services. Never edit an already-applied migration.

**Render PostgreSQL** is the alternative if you want everything under one Render account — create
the instance and use its Internal URL for services in the same region, External URL for migrations.

### 2.2 — Worker → Render Background Worker

1. **New → Background Worker**, connect the GitHub repo.
2. Settings:
   - **Root Directory:** _(leave blank — repo root; the monorepo build needs all packages)_
   - **Build Command:**
     ```bash
     corepack enable && pnpm install --frozen-lockfile && pnpm --filter @digest/db generate
     ```
   - **Start Command:**
     ```bash
     pnpm --filter @digest/worker start
     ```
     (runs `tsx src/index.ts` — the worker ships as TS source, no compile step; see
     [`ADR-0016`](./adr/ADR-0016-next16-vitest4-upgrade.md) note on tsx-in-prod.)
3. **Environment** (see the table in §2.4). At minimum: `DATABASE_URL` (pooled), the email
   provider creds, `ANTHROPIC_API_KEY` + `EXA_API_KEY`, `APP_BASE_URL`, and the `AUTOSEND_*`
   guardrails.
4. Deploy. Confirm the logs show `worker.boot` → `worker.settings.loaded` →
   `worker.topics.loaded` and the registered cron pairs. If it exits with `worker.settings.missing`,
   the seed didn't run against this DB.

> **Auto-send safety:** ship with `AUTOSEND_ENABLED=false` first. Sends then require dashboard
> approval. Flip to `true` only after a verified test issue, and keep the Settings kill-switch as
> the runtime override.

### 2.3 — Web → Vercel

1. **Import Project** → select the repo. Set **Root Directory** to `apps/web` (Vercel's monorepo
   support still installs from the repo root).
2. Framework preset: **Next.js** (auto-detected). Override the **Build Command** so the Prisma
   client is generated before the Next build:
   ```bash
   pnpm --filter @digest/db generate && pnpm --filter @digest/web build
   ```
   Install command stays the default `pnpm install`. Output is handled by the Next.js preset.
3. **Environment Variables** (Production + Preview) — see §2.4.
4. Deploy. Set the custom domain, then set `APP_BASE_URL` / `AUTH` issuer URLs to that domain and
   redeploy (email links + OAuth callbacks are absolute).

> Turbopack build note: `next.config.mjs` sets `outputFileTracingRoot` to the repo root and lists
> `argon2`, `exa-js`, `rss-parser` in `serverExternalPackages` so they are not bundled. Do **not**
> re-add a webpack block — the app builds on Turbopack ([`ADR-0017`](./adr/ADR-0017-turbopack-migration.md)).

### 2.4 — Environment variables by service

| Variable | Web (Vercel) | Worker (Render) | Notes |
|---|:---:|:---:|---|
| `DATABASE_URL` | ✅ (pooled) | ✅ (pooled) | Neon pooled URL + `?sslmode=require` |
| `AUTH_SECRET` | ✅ | — | `openssl rand -base64 32` |
| `AUTH_MODE` | ✅ | — | `entra` (prod) or `local` |
| `AUTH_MICROSOFT_ENTRA_ID_*` | ✅ | — | Entra app reg — [`RUNBOOK §4`](./RUNBOOK.md) |
| `ANTHROPIC_API_KEY` | ✅ | ✅ | required by `run-pipeline` + scheduled pipeline |
| `EXA_API_KEY` | ✅ | ✅ | neural search; RSS-only fallback if absent |
| `ACS_CONNECTION_STRING` / `ACS_SENDER_ADDRESS` | — | ✅ | default email provider |
| `RESEND_API_KEY` / `GRAPH_*` | — | ✅ | alternate providers |
| `APP_BASE_URL` | ✅ | ✅ | absolute base for email logo/links + approval URLs |
| `AUTOSEND_ENABLED` | — | ✅ | start `false` |
| `AUTOSEND_MAX_SUBSCRIBERS` | — | ✅ | unattended-send ceiling |

Secrets live in the platform env only — **never** in the database or the repo. The dev-only
`CLAUDE_CODE_DEV_CLIENT` / `CLAUDE_CODE_MODEL` vars must **not** be set on either hosted service.

---

## Migrations on deploy

- **Schema changes** are applied with `prisma migrate deploy` against the **direct** DB URL,
  run as a one-off from a trusted machine (or a Render one-off Job) — not automatically inside the
  always-on worker, so a bad migration can't crash-loop the service.
- Generate a new migration locally (`pnpm --filter @digest/db migrate`), commit it, then
  `migrate:deploy` to staging → verify → production. Never edit an applied migration file.

---

## Production checklist

- [ ] Database provisioned; `migrate:deploy` + `seed` run against it (Settings row + default topic exist).
- [ ] Worker boots cleanly: `worker.settings.loaded` + `worker.topics.loaded` + cron pairs registered.
- [ ] `AUTOSEND_ENABLED=false` for the first cycle; a manual test issue sent + verified.
- [ ] `APP_BASE_URL` and Entra callback URLs point at the real domain (email links + login work).
- [ ] Email DNS (SPF / DKIM / DMARC) verified for the sending subdomain — [`RUNBOOK §5`](./RUNBOOK.md).
- [ ] `ANTHROPIC_API_KEY` + `EXA_API_KEY` present on **both** services.
- [ ] No `CLAUDE_CODE_DEV_CLIENT` on any hosted service (dev client stays local).
- [ ] `pnpm turbo run lint type-check test` green on the deployed commit.
```
