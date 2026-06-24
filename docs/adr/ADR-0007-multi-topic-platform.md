# ADR-0007 — Multi‑topic newsletter platform (fully isolated per‑topic)

**Status:** Accepted · **Date:** 2026-06-24 · **Roadmap:** [ROADMAP.md](../ROADMAP.md)

## Context

v1 is single‑topic by construction. The digest topic is a hardcoded constant
(`DEFAULT_TOPIC = "on-prem & enterprise AI workflows"` in
`packages/curation/src/ingest/sources.ts`), threaded at runtime via
`SourceContext.topic` but never persisted. The schema enforces a single global
newsletter: `Issue.isoWeek @unique` (one issue per week, globally),
`CandidateArticle.sourceUrl`/`contentHash` globally unique (global dedup), and
`Source`/`Subscriber`/`Settings` carry no topic dimension. The pipeline prompts
hardcode the Mega Bilgisayar Turkish‑IT audience; the scheduler runs one global
cron pair; delivery sends to all active subscribers.

We want to run **many independent newsletters** ("topics"), each with its own
sources, curation, audience, schedule, and branding — the foundation for the
analytics, growth, optimization, and white‑label phases on the roadmap.

## Decision

**Topic becomes a first‑class entity, with fully isolated per‑topic data.**

1. **`Topic` model** — `id`, `slug` (unique), `name`, `description`, `audience`
   (drives prompts), `voice`, `status` (active|paused), plus per‑topic config
   carried for later phases: schedule (`sendDayOfWeek`/`sendTime`/`timezone`/
   `pipelineLeadDays`/`autoSendEnabled`) and branding (`fromAddress`/`replyTo`/
   logo/colors), all nullable with fallback to the global `Settings`.

2. **Full isolation** — add `topicId` (FK) to `Source`, `CandidateArticle`,
   `IngestRun`, `Issue`, and `PipelineRun`. Replace global uniqueness with
   composite keys: `Issue @unique([topicId, isoWeek])`,
   `CandidateArticle @unique([topicId, sourceUrl])` + `@unique([topicId, contentHash])`.
   Each topic has its own sources and its own candidate pool; a feed used by two
   topics is two `Source` rows and is scanned/deduped per topic.

3. **Per‑topic audience** — subscribers (email identities) opt into topics via a
   `SubscriberTopic` join (`subscriberId`, `topicId`, `status`, `unsubscribeToken`).
   Delivery filters recipients to the issue's topic. The scheduler registers one
   cron pair per active topic.

4. **Migration** — seed a Topic `enterprise-ai` (today's `DEFAULT_TOPIC`) and
   backfill `topicId` onto all existing rows, so the current newsletter is
   unchanged after the migration.

## Alternatives considered

- **Shared candidate pool, topic‑tagged sources** — one global scan; curation
  filters a shared pool by each topic's sources/keywords. Less duplication, but
  softer topic boundaries (filtering, not isolation) and shared dedup that
  couples topics. Rejected in favor of clean isolation.
- **Hybrid (sources shareable across topics; one scan; candidates attributed to
  topics)** — best storage/scan efficiency, but a more complex mental and data
  model. Rejected for now in favor of the simplest model to reason about and to
  present; can be revisited if duplicate scanning becomes costly.

## Consequences

- **Pro:** clean separation — each newsletter is genuinely its own thing
  (sources, pool, issue, audience, schedule, brand); simplest model to explain
  and operate; unblocks every later roadmap phase.
- **Con (accepted):** a feed shared by N topics is scanned N times and its
  articles stored N times. Acceptable at expected topic counts; the daily scan
  loops active topics, each committing to its own `data/candidates/<slug>/` dir.
- The pipeline/delivery/scheduler engine is **threaded with `topicId`, not
  rewritten** — global keys become composite; behavior per topic is unchanged.
- Prompts gain a topic‑context input (name/audience/voice) instead of a
  hardcoded audience.
- Secrets remain in env; per‑topic `fromAddress`/branding are non‑secret config
  on `Topic`.

## Rollout

Three sub‑phases, each its own PR (see ROADMAP Phase 1): **1a** schema +
migration + threading (invisible), **1b** Topics management UX + scoping, **1c**
per‑topic subscribers, schedules, and sending. The human‑as‑LLM curate path lets
new topics be curated immediately without an API key.
