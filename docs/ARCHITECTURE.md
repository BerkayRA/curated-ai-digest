# Architecture — Curated AI Digest

## System overview

Self-hosted (Docker Compose) monorepo. Two runtimes share Prisma + Zod contracts:

- **`apps/web`** — Next.js App Router. Dashboard UI + admin API (Route Handlers / Server
  Actions). Entra ID SSO. No realtime requirement, so the API lives inside Next (see ADR-0001).
- **`apps/worker`** — Node service. Scheduler + the weekly curation pipeline + scheduled sends.

```
            ┌───────────────────────────────────────────────┐
            │                  Postgres (db)                 │
            └───────────────▲───────────────────▲────────────┘
                            │ Prisma            │ Prisma
        ┌───────────────────┴──────┐   ┌────────┴───────────────────┐
        │        apps/web          │   │        apps/worker          │
        │  dashboard + admin API   │   │  scheduler + pipeline runner │
        │  Entra SSO, preview,     │   │  ingest→rank→curate→write→QA │
        │  approve/send actions    │   │  →render→draft; scheduled send│
        └──────────┬───────────────┘   └───────┬──────────────────────┘
                   │ packages/email             │ packages/{curation,email,shared,db,brand}
                   ▼                            ▼
        EmailProvider (ACS default · Graph · Resend)
```

## Packages

| Package | Responsibility |
|---|---|
| `@digest/shared` | Zod schemas, enums, DTOs — single source of truth for the data/wire contract. |
| `@digest/db` | Prisma schema, generated client, migrations, seed. |
| `@digest/curation` | Claude agent pipeline stages (cost-routed), each idempotent + resumable. |
| `@digest/email` | React Email templates + `EmailProvider` interface + ACS/Graph/Resend impls. |
| `@digest/brand` | Design tokens (CSS custom properties), Buka/logo assets, font wiring. |

## Curation pipeline

```
Ingest (Exa neural search + curated RSS; canonicalize + dedup by contentHash)
  → Stage 1 RANK     (sonnet)  relevance + importance scoring
  → Stage 2 CURATE   (opus)    pick top 2-3, diversity, dedupe near-dupes
  → Stage 3 COPYWRITE(opus)    Turkish marketing summaries + subject + preheader
  → Stage 4 EDITOR/QA(opus)    fact-check vs source, TR grammar/tone, brand voice → qaFlags
                               (retry loop back to Stage 3, max N)
  → Stage 5 RENDER   (—)       React Email → branded HTML
  → create Issue(draft) → approval gate OR guarded auto-send
```

Each stage writes a `PipelineRun` row (model, tokens, costUsd) for observability + budget
control. Model routing is a config map so any stage can be re-pointed without code changes.

## Delivery — pluggable EmailProvider

```ts
interface EmailProvider {
  readonly kind: 'acs_email' | 'microsoft_graph' | 'resend';
  send(msg: EmailMessage): Promise<SendResult>;
  sendBatch(msgs: EmailMessage[]): Promise<SendResult[]>;
  verifyConfig(): Promise<{ ok: boolean; detail?: string }>;
}
```

Default `acs_email`. A rate-limiter + retry/backoff wrapper fronts every provider.
Provider chosen at runtime via `Settings.activeProvider`.

## Auto-send guardrails

Auto-send (when `Settings.autoSendEnabled`) skips the human gate ONLY if: ≥1 curated item,
QA flags clear, provider `verifyConfig()` ok, subscriber count within sane bounds, and the
kill-switch is off. Otherwise it falls back to `draft` + alerts. Every send writes `AuditLog`.

## Status state machine

`draft → in_review → approved → scheduled → sent`, plus `cancelled` / `failed`. Transitions
are guarded; each writes an `AuditLog` row with the actor.
