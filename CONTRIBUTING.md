# Contributing to Mega Bülten

Thanks for your interest in improving Mega Bülten. This guide covers local setup, the workspace
layout, coding conventions, how to run the checks, and what we expect on a pull request.

## Setup requirements

Mega Bülten is a **pnpm + Turborepo monorepo** targeting **Node ≥ 20** and **pnpm 10**. You also need
**Docker** to run the local Postgres instance.

```bash
git clone https://github.com/megabilgisayar/mega-bulten.git
cd mega-bulten

pnpm install
pnpm db:up          # Postgres (+ Adminer under the dev profile) on host port 5433
pnpm db:migrate
pnpm db:seed
pnpm dev            # web at http://localhost:3100 + worker
```

Copy `.env.example` to `.env` and fill in the keys you need. Most of the dashboard runs without
external keys (with the argon2 local-auth fallback), but the curation pipeline needs
`ANTHROPIC_API_KEY` and `EXA_API_KEY`, and sending needs an email provider configured.

> The Compose Postgres listens on **`localhost:5433`** from the host (mapped from container port
> `5432`). Inside Compose the hostname is `db`. Migrations and seeds run against the host port.

## Workspace layout

| Workspace | Responsibility |
| --- | --- |
| `apps/web` | Next.js (App Router) dashboard + admin API; Entra SSO, preview, approve/send. |
| `apps/worker` | Node service: croner scheduler + the weekly curation pipeline + scheduled sends. |
| `packages/shared` | Zod schemas, enums, DTOs — the single source of truth for the data/wire contract. |
| `packages/db` | Prisma schema, generated client, migrations, seed. |
| `packages/curation` | Claude agent pipeline stages (cost-routed) + the modular `SourceProvider`s (rss/exa/radar). |
| `packages/email` | React Email templates + the pluggable `EmailProvider` interface (ACS / Graph / Resend). |
| `packages/delivery` | Dispatch service: rate-limit + retry/backoff, batch send, PII-scrubbed send records. |
| `packages/brand` | Design tokens (CSS custom properties), Buka/logo assets, font wiring. |
| `packages/radar` | `@mega-bulten/radar` — the RFC-001 scaffold for an LLM-optional, topic-configurable radar. |

Workspace packages are referenced as `@mega-bulten/<name>`.

## Coding conventions

- **TypeScript everywhere, strict mode, no `any`.** Prefer precise types and let inference work.
- **Zod is the contract.** Schemas, enums, and DTOs live in `packages/shared`; derive types from
  them (`z.infer`) rather than redeclaring shapes. Validate at every system boundary.
- **Immutable data flow.** Functions return new objects; never mutate arguments in place.
- **Many small, focused modules** over large files. Keep files cohesive and under ~800 lines.
- **Isolate failures.** Source providers and collectors never throw out of `fetch()`/`collect()` —
  per-item failures become recorded errors and degrade the run, they don't abort it.
- **Prettier** is the formatter; the config lives in the root `package.json`
  (`semi`, `singleQuote`, `trailingComma: all`, `printWidth: 100`, `tabWidth: 2`). Run
  `pnpm format` before committing.

### Commits & branches

- Branches follow `feat/<scope>/<desc>` or `fix/<scope>/<desc>`.
- Commit messages follow **[Conventional Commits](https://www.conventionalcommits.org/)** — e.g.
  `feat(curation): add radar source provider`, `fix(web): handle AuthError on login`,
  `docs(readme): document RADAR_ENABLED toggle`.

## Running the checks

Turborepo fans these out across the affected workspaces; you can also target one package with
`pnpm --filter @mega-bulten/<name> <script>`.

```bash
pnpm type-check     # tsc --noEmit across every workspace
pnpm lint           # lint across every workspace
pnpm test           # Vitest unit/integration suites
pnpm test:e2e       # Playwright E2E + visual regression + axe a11y (uses system Chrome)
pnpm build          # turbo build — web (Next standalone) + worker
```

## Testing expectations

- **Write tests first.** New behavior lands via TDD; add a failing test, then implement.
- **Cover behavior, not implementation detail.** Unit-test pure logic (scoring, dedupe,
  canonicalization, guardrail evaluation); use integration tests for pipeline orchestration and the
  admin API; reserve E2E + visual regression for the dashboard flows.
- **External dependencies stay behind interfaces** (`SourceProvider`, `EmailProvider`, the Claude
  client) so they can be mocked deterministically. No real network or LLM calls in unit tests.
- **Keep the suite green.** The project currently ships **512 passing tests**; a PR must not regress
  that, and meaningful new code should arrive with tests. The coverage bar is **80%+**.

## Pull request expectations

Before opening a PR:

1. `pnpm type-check`, `pnpm test`, and `pnpm build` all pass locally.
2. New or changed behavior has tests; the suite stays green.
3. Code is formatted (`pnpm format`) and follows the conventions above.
4. The branch is rebased on the latest `main` with conflicts resolved.

In the PR description, summarize **what** changed and **why**, list the checks you ran, and link any
related issue, ADR, or RFC. Keep PRs focused — one logical change per PR makes review faster.

By contributing you agree that your contributions are licensed under the project's
[MIT License](LICENSE) and that you will follow the [Code of Conduct](CODE_OF_CONDUCT.md).
