# PRD — Curated AI Digest

## Problem

Mega Bilgisayar wants to position itself as an AI-savvy IT company to its customers and
prospects via a **weekly AI-news digest newsletter**, without a person manually hunting and
writing it each week.

## Users

- **Marketing/admin (internal):** reviews, edits, approves, and sends issues via the dashboard.
- **Customers/prospects (external):** receive the Turkish newsletter.

## Scope (v1 — full build)

- Automated weekly curation of **2–3** important AI-news items.
- **Turkish, marketing-grade** copy in Mega's brand voice; fact-checked against sources.
- Branded HTML email (Buka dot-dissolve motif, Process Blue, Nunito Sans).
- **Human approval gate by default**; **guarded auto-send toggle** for holidays.
- Dashboard: archive, draft editor, live preview, subscriber CRUD + import, settings, send/approve.
- **Entra ID SSO** for the dashboard.
- Pluggable email delivery (**ACS default**), analytics scaffold (opens/clicks) deferrable in-build.

## Out of scope (v1)

- Multi-language (TR only). A/B subject testing. Advanced segmentation. Public sign-up page
  (subscribers imported/managed by admin) — revisit later.

## Success criteria

- [ ] Weekly cron yields a `draft` with 2–3 curated, deduped, Turkish summaries + subject.
- [ ] Human can review/edit/preview/approve/send from the dashboard.
- [ ] Auto-send delivers without human action when enabled (guardrails enforced).
- [ ] Renders correctly in Outlook/Exchange + Gmail + Apple Mail.
- [ ] Provider switch is config-only.
- [ ] 80%+ test coverage; brand-fidelity audit passes.
