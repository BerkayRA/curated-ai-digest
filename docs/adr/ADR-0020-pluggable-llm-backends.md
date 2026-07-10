# ADR-0020 — Pluggable LLM backends (Claude Code dev client + Ollama future)

- **Status:** Accepted
- **Date:** 2026-07-10
- **Phase:** Cost / operability (decouple curation from API credits)
- **Relates to:** the existing human-as-LLM path (`manual-curate`), [[ADR-0016-next16-vitest4-upgrade]] (tsx-in-prod for the worker)

## Context

Every LLM stage of the pipeline (rank → curate → copywrite → editor QA) talks to
Claude through a single injectable seam:

```ts
// pipeline/types.ts
export type AnthropicClient = Pick<Anthropic, 'messages'>;   // just .messages.create()

// pipeline/orchestrator.ts
const anthropicClient = opts.anthropicClient ?? new Anthropic({ apiKey });
```

The default client is the metered Anthropic SDK (billed per token). The operator
wants to run the pipeline for **test/dev** without spending API credits, given
they already have a Claude Code subscription locally. Three routes were weighed:

1. **Local model (Ollama)** on the operator's own GPU box — clean, free,
   self-hostable, no ToS concern. Deferred (see below).
2. **Human-as-LLM** — already shipped (`curate:manual`): export the candidate
   pool as a prompt, paste into Claude, paste the selection back. Zero cost,
   Claude-quality, ToS-clean. Kept as the manual override.
3. **Claude Code headless** — route `messages.create` through the local
   `claude -p` CLI, drawing on the subscription. Built here, **dev/test only**.

## Decision

1. **Add a Claude Code dev `AnthropicClient` (`createClaudeCodeClient`).** It
   implements the `.messages.create()` seam by spawning `claude -p --output-format
   json`. Because the CLI has no native tool-use, structured output is *emulated*:
   the tool's `input_schema` is described in the prompt, the model is told to emit
   a single bare JSON object, and the CLI `result` is parsed back into a synthetic
   `tool_use` content block with real token `usage`. No stage logic changes.

2. **Hard dev-only guard.** `assertDevOnly()` throws when `NODE_ENV=production`
   and requires an explicit `CLAUDE_CODE_DEV_CLIENT=1` opt-in otherwise. The
   client is **never** referenced by `scheduler.ts` — the cron/send path always
   uses the real API client. The only wiring is a manual worker script,
   `pnpm --filter @digest/worker pipeline:dev`.

3. **Security: no shell, prompt via stdin.** The runner uses `spawn(binary, args,
   { shell: false })` with a fixed argv allow-list; the untrusted prompt (scraped
   article titles/excerpts) is written to **stdin**, never argv — so no candidate
   content can be interpreted as a CLI flag or shell metacharacter. A timeout
   kills a hung CLI; `ENOENT` surfaces a friendly "install Claude Code" error.

4. **Trade-offs accepted.** The dev client ignores the API `MODEL_MAP` routing and
   uses whatever model the Claude Code session is set to (overridable via
   `CLAUDE_CODE_MODEL`). `costUsd` on `PipelineRun` still reflects API pricing as a
   basis even though real subscription spend is $0. **ToS:** a consumer
   subscription is for interactive use — this backend is for local experimentation
   only and must not power an automated commercial send path.

5. **Orchestrator no longer demands `ANTHROPIC_API_KEY` when a client is
   injected.** The key check moved inside the `else` branch that constructs the
   default SDK client, so an injected client (tests, or the dev client) runs
   without the key.

## Future extension — Ollama local adapter (deferred, route 1)

The same `AnthropicClient` seam makes a **self-hosted** backend a drop-in: wrap
the operator's existing Ollama box (the `ollama-gpu` LXC) in a client that
translates `messages.create` + tool_use into an Ollama chat call with JSON-mode
and parses the structured output back. Unlike the Claude Code client this is
**ToS-clean and automatable** — a candidate for the scheduled/cron path, letting
production sends run free on owned hardware. Deferred until there's a need to take
the automated pipeline off metered API credits; copywrite is the quality-sensitive
stage to validate a local model against. Tracked in [`ROADMAP.md`](../ROADMAP.md).

## Consequences

- Dev/test pipeline runs cost **$0** in API credits via `pipeline:dev`.
- Two zero-cost curation paths now exist: human-as-LLM (manual, Claude-quality)
  and Claude Code CLI (automated-shape, dev-only).
- 18 unit tests cover the guard, prompt construction, fence-stripping, envelope
  parsing, and tool_use emulation with an injected runner.
- No change to the production send path or its cost profile.
