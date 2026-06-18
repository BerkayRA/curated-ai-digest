# Changelog

All notable changes to Curated AI Digest are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Nothing yet.

## [0.1.0] — 2026-06-18

Initial build of the weekly AI-news digest system.

### Added

- **Monorepo foundation** — pnpm + Turborepo workspace; `apps/web`, `apps/worker`, and
  `packages/{shared,db,email,curation,delivery,brand,radar}`; Docker Compose (Postgres + web +
  worker); strict TypeScript, Vitest, Playwright.
- **Data model** — PostgreSQL + Prisma schema (Issue, IssueItem, CandidateArticle, Subscriber,
  Settings, Send, IngestRun, PipelineRun, AuditLog) with Zod contracts in `@digest/shared`.
- **Modular ingestion** — a pluggable `SourceProvider` interface; built-in **RSS** and **Exa**
  providers; a configurable `topic` (default _on-prem & enterprise AI workflows_); per-provider
  failure isolation.
- **Optional radar source provider** — can consume a deterministic news radar's
  `history.jsonl` / change feed (e.g. the
  [On-Prem AI Adoption Radar](https://github.com/ekaynac/onprem-ai-adoption-radar)) and map ring
  decisions into newsletter candidates; deterministic, off by default
  (`RADAR_ENABLED` / `RADAR_FEED_URL`).
- **Curation pipeline** — five cost-routed, resumable Claude stages (rank → curate → copywrite →
  editor/QA → render) with a fact-check + brand-voice QA loop and per-stage token/cost logging.
- **Branded email** — React Email templates → Outlook-safe HTML with the Buka chameleon header
  band, dot-grid motif, numbered story blocks, and a dark footer.
- **Pluggable email delivery** — `EmailProvider` interface with **Azure Communication Services**
  (default), **Microsoft Graph**, and **Resend**, plus a rate-limiter + retry/backoff dispatch
  service with PII-scrubbed `Send` records.
- **Dashboard** — Next.js App Router UI: issue archive, draft editor with live preview, subscriber
  CRUD + CSV import, settings, and a "Yeni Sayı" manual-create + on-demand curation flow.
- **Approval workflow & auto-send** — guarded `IssueStatus` state machine
  (`draft → in_review → approved → scheduled → sent`, plus `cancelled` / `failed`) with `AuditLog`
  on every transition; a guarded auto-send mode (holiday toggle) with kill-switch + bound checks.
- **Authentication** — Microsoft Entra ID SSO (tenant- and group-restricted) behind an
  `AuthProvider` seam, with an argon2 local fallback for development.
- **Editorial design system** — hero-led UI sharing the Mega standard with the radar (Process Blue,
  Buka dot-dissolve, Hanken Grotesk fallback, vector chameleon logo), automatic light/dark mode.
- **`@digest/radar` scaffold** — RFC-001 design + a typed scaffold for an LLM-optional,
  topic-configurable deterministic radar that emits the same feed contract the radar provider reads.
- **Docs** — PRD, Architecture, Brand, Runbook, Security audit, ADR-0001/0002/0003, RFC-001, and the
  radar data-contract / design-language findings.

### Security

- HTTP security headers + CSP, explicit `SameSite` cookies + same-origin checks on mutating routes,
  argon2 credential hashing, signed unsubscribe tokens, PII scrubbing in send records, and static-
  asset allowlisting in the auth middleware. See [`docs/SECURITY.md`](docs/SECURITY.md).

[Unreleased]: https://github.com/BerkayRA/curated-ai-digest/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/BerkayRA/curated-ai-digest/releases/tag/v0.1.0
