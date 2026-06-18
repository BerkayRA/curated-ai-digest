# ADR-0001 — Stack & Architecture

**Status:** Accepted · **Date:** 2026-06-16

## Context

Greenfield weekly AI-news digest newsletter for Mega Bilgisayar's customers. Needs a curation
pipeline, a branded email, and an approval dashboard. Self-hosted on Mega's own infra. The
team's reference project (`berkaymakes-cms`) uses pnpm + Turborepo, Prisma 6, Zod
`packages/shared`, NestJS + Next, Vitest/Playwright.

## Decisions

1. **Monorepo:** pnpm + Turborepo, mirroring `berkaymakes-cms` conventions.
2. **Admin API inside Next.js (no separate NestJS):** this product has no realtime
   requirement (berkaymakes-cms uses NestJS only for Socket.io chat). The admin surface is
   CRUD + a few actions, so Route Handlers / Server Actions keep the self-hosted footprint
   smaller. Confirmed with the user.
3. **Separate Node worker** for the scheduler + curation pipeline; shares `packages/db`
   and `packages/shared`.
4. **PostgreSQL + Prisma**; enums/DTOs mirrored into `packages/shared` as Zod (single
   source of truth).
5. **Email delivery behind a pluggable `EmailProvider`**, default **Azure Communication
   Services Email** (Microsoft-native bulk; isolated sending identity, doesn't touch the
   corporate Exchange mailbox reputation). Graph + Resend also implemented.
6. **Auth: Microsoft Entra ID SSO** (Auth.js Entra provider), tenant + allowed-group
   restricted. Behind an `AuthProvider` seam with an argon2 local fallback so work isn't
   blocked on the app registration.
7. **Job orchestration:** cron + DB-backed job rows for v1 (weekly cadence is low volume);
   add BullMQ + Redis only if needed.

## Consequences

- Fewer services to operate than a NestJS split; all admin logic co-located with the UI.
- Provider abstraction lets us start on ACS and switch without code changes.
- List size is ~hundreds, so ACS on a dedicated subdomain is comfortably within limits.

## Related

- ADR-0002 — Typography / Centrale Sans licensing & Nunito Sans fallback.
