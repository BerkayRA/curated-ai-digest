# Security

## Applied Fixes

### [CRITICAL] iframe XSS — `apps/web/components/issue-editor/PreviewPanel.tsx`

**Problem:** The preview iframe used `sandbox="allow-same-origin"` on a `srcDoc` of LLM-generated HTML. Combined with `allow-same-origin`, any injected script could access the parent origin's cookies, `localStorage`, and APIs.

**Fix:** Changed to `sandbox=""`. Email HTML is static (no scripts needed), so rendering is unaffected. The empty sandbox still blocks scripts, forms, and same-origin access.

---

### [CRITICAL] Predictable seed tokens — `packages/db/prisma/seed.ts`

**Problem:** All seeded subscribers received hardcoded, guessable `unsubscribeToken` values (e.g. `unsub-ahmet-yilmaz-001`). Anyone who knew the pattern could forge unsubscribe links.

**Fix:** Each seeded subscriber now receives a `randomUUID()` call at seed time so tokens are cryptographically unpredictable.

---

### [HIGH] Security headers — `apps/web/next.config.mjs`

**Problem:** The application served no security-relevant HTTP response headers, leaving it vulnerable to clickjacking, MIME sniffing, cross-origin leakage, and lacking HSTS enforcement.

**Fix:** Added an `async headers()` returning the following headers for all routes:

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`

---

### [HIGH] Adminer exposure — `docker-compose.yml`

**Problem:** The Adminer database admin UI was bound to `0.0.0.0:8080`, exposing it to all network interfaces in any deployment environment.

**Fix:** Added `profiles: ["dev"]` (Adminer only starts with `--profile dev`) and bound the port to `127.0.0.1:8080:8080` so it is only reachable from localhost.

---

### [HIGH] Unvalidated status param — `apps/web/app/api/subscribers/route.ts`

**Problem:** The `?status=` query parameter was cast directly to a union type (`status as 'active' | 'unsubscribed' | 'bounced'`) with no validation, allowing arbitrary strings to reach the Prisma query.

**Fix:** Replaced the cast with `z.enum(['active', 'unsubscribed', 'bounced']).optional().safeParse(...)`. Invalid values are silently ignored (treated as no filter).

---

### [HIGH] CSRF hardening — `apps/web/auth.config.ts` + `apps/web/lib/assert-same-origin.ts`

**Problem:** (a) Session cookies lacked explicit `httpOnly`, `sameSite`, and `secure` options, relying on Auth.js defaults which vary by version. (b) State-changing POST handlers had no cross-origin request protection beyond the session cookie.

**Fix:**
- (a) Set explicit cookie options: `httpOnly: true`, `sameSite: 'lax'`, `secure: process.env.NODE_ENV === 'production'`, `path: '/'`.
- (b) Created `apps/web/lib/assert-same-origin.ts` — a pure helper that rejects requests whose `Origin` header is present and does not match `APP_BASE_URL`. Applied at the top of `POST /api/issues/[id]/send` and `POST /api/issues/[id]/transition`.

---

### [MEDIUM] Item ownership — `apps/web/app/api/issues/[id]/route.ts`

**Problem:** The PATCH handler's `issueItem.update` call only filtered by item `id`, not by the parent `issueId`. A user could supply item IDs belonging to a different issue and mutate them.

**Fix:** Changed the Prisma `where` clause to `{ id, issueId: params.id }` so items from another issue cannot be updated through this endpoint.

---

### [MEDIUM] PII in Send.error — `packages/delivery/src/dispatch.ts`

**Problem:** Error strings from failed batch sends were persisted verbatim to `Send.error`. Provider error messages often include the recipient email address, causing subscriber PII to be stored in the database indefinitely.

**Fix:** Added a `scrubPii(input)` helper that replaces email addresses (matched by `/[\w.+-]+@[\w-]+\.[\w.]+/g`) with `[redacted]` before the error string is written to the database. The helper is applied both in `recordSend` (default Prisma repo) and in the batch-failure catch block.

---

### [LOW] URL scheme allowlist — `packages/curation/src/ingest/`

**Problem:** The ingest pipeline accepted candidate `sourceUrl` values with any scheme (including `javascript:`, `data:`, `file:`). These could propagate to the database and be rendered in email templates.

**Fix:** Added `isAllowedScheme(raw: string): boolean` to `canonicalize.ts` that returns `true` only for `http:` and `https:`. The `deduplicateWithinRun` function in `dedup.ts` now silently skips any candidate whose `sourceUrl` fails this check.

---

### [LOW] CSV size bound — `apps/web/app/api/subscribers/import/route.ts`

**Problem:** The CSV import endpoint parsed the entire request body without a size limit, making it susceptible to denial-of-service via very large uploads.

**Fix:** Added a 5 MB guard (`MAX_CSV_BYTES = 5 * 1024 * 1024`). Requests exceeding this limit receive a `413` response before any parsing occurs.

---

### [Docker] Health route — `apps/web/app/api/health/route.ts`

**Problem:** The Docker Compose healthcheck referenced `/api/health` but the route did not exist in the codebase.

**Fix:** Created `apps/web/app/api/health/route.ts` returning `{ status: 'ok' }` with a 200 status. Added `/api/health` to `PUBLIC_PREFIXES` in `apps/web/lib/auth-guard.ts` so the route requires no authentication.

---

### [CRITICAL→pin] Next.js version floor — `apps/web/package.json`

**Problem:** The `next` dependency was pinned at `^14.2.18`, which includes versions affected by CVE-2025-29927 (middleware auth bypass). The installed version (14.2.35) already patches this, but the manifest floor allowed downgrade.

**Fix:** Bumped the floor from `^14.2.18` to `^14.2.30`. No upgrade to Next.js 15 (out of scope).

---

### [MEDIUM] Env safeguard — `packages/db/.gitignore`

**Problem:** The `packages/db/` directory had no `.gitignore`, allowing `.env` files containing database credentials to be committed accidentally.

**Fix:** Added `packages/db/.gitignore` containing `.env`, `.env.*`, and `!.env.example` as a local backstop.

---

## Deferred Items

### (a) Next.js 15 upgrade

**Current state:** Running Next.js 14.2.35 (patched for CVE-2025-29927). The version floor is now `^14.2.30`.

**Rationale for deferral:** Next.js 15 introduces breaking changes (App Router API differences, `params` is now a Promise, `next.config.ts` format changes). A major version upgrade requires a dedicated migration effort with full E2E regression testing and is out of scope for this security patch set.

**Recommendation:** Plan the upgrade as a separate milestone after establishing Playwright E2E coverage.

---

### (b) Distributed rate limiting

**Current state:** No rate limiting is applied to any endpoint. The `/api/auth` login route and `/unsubscribe` endpoint are particularly sensitive.

**Rationale for deferral:** Effective distributed rate limiting in a Next.js App Router setup requires either an edge-compatible store (Redis/Upstash) or a reverse-proxy-level solution. The current deployment does not have Redis configured.

**Recommendation:** Integrate `@upstash/ratelimit` with a Upstash Redis instance for `/api/auth/callback/credentials` (brute-force login protection) and `/api/unsubscribe` (token enumeration protection). Alternatively, apply rate limiting at the reverse proxy (nginx/Traefik) level.

---

### (c) Vitest bump to ≥ 3.2.6

**Current state:** The project uses Vitest 2.1.8 across packages. GHSA-5xrq-8626-4rwp is a dev-only vulnerability in Vitest.

**Rationale for deferral:** Vitest 3.x is a major version bump with configuration and API changes. It is a dev-only dependency and does not affect production. The vulnerability is not exploitable in CI environments without untrusted code execution.

**Recommendation:** Upgrade Vitest to ≥ 3.2.6 in the next routine dependency maintenance window. Run the full test suite after upgrading to catch any API changes.

---

### (d) Rotating default DB credentials

**Current state:** `docker-compose.yml` uses `POSTGRES_USER: bulten` / `POSTGRES_PASSWORD: bulten` as defaults, which are also present in `.env.example`.

**Rationale for deferral:** Credential rotation requires coordination with the deployment pipeline (updated secrets in CI/CD, updated `DATABASE_URL` in `.env`, potential migration re-run). The compose file is development-only; production should already use environment-specific secrets via `env_file` or a secrets manager.

**Recommendation:** For production deployments, inject `POSTGRES_USER` and `POSTGRES_PASSWORD` from a secrets manager (HashiCorp Vault, AWS Secrets Manager, etc.) rather than using the compose defaults. Remove the `bulten/bulten` defaults from any production `.env` files.
