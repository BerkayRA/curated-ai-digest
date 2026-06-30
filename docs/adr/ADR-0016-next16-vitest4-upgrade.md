# ADR-0016 — Next.js 16 + Vitest 4 upgrade

- **Status:** Accepted
- **Date:** 2026-06-30
- **Phase:** Maintenance (deferred backlog)
- **Relates to:** [[ADR-0013-next15-vitest3-upgrade]], [[ADR-0015-react-19-upgrade]] (React 19 landed first, as Next 16 requires it)

## Context

Following the Next 15 / Vitest 3 step (ADR-0013) and React 19 (ADR-0015), this
completes the "stay current" track: **Next.js 15 → 16.2.9** and **Vitest 3 → 4.1.9**.
Next 16 is a larger major than 15 — it flips several defaults — so each break and
the chosen resolution is recorded below.

## Decision

### Next.js 16

1. **Turbopack is now the default bundler; we pin webpack via `--webpack`.**
   Turbopack cannot resolve the workspace packages' explicit `.js` import
   specifiers to their `.ts` sources (the NodeNext convention these packages use),
   and it has no `extensionAlias` equivalent. Rather than refactor every
   `@digest/*` package to drop `.js` specifiers, we keep webpack: the web
   `build`/`dev` scripts and the Playwright smoke config pass `--webpack`, and the
   webpack `extensionAlias` config is restored. **Migrating to Turbopack is a
   tracked follow-up** (it requires the package-wide specifier change).

2. **`middleware.ts` → `proxy.ts`.** Next 16 renamed the convention (same Edge
   handler + matcher API). The file is renamed and the default export / type
   updated (`export default proxy`, `NextProxy`). The archive rate-limit + auth
   logic are unchanged.

3. **`next lint` was removed.** The web `lint` script now invokes ESLint directly
   (`eslint . --ext .js,.jsx,.ts,.tsx --max-warnings 0`). **`eslint-config-next`
   is deliberately kept at 15.5.19** (ESLint 8 / eslintrc): version 16 requires
   ESLint 9 + flat config, which would force a flat-config migration across all 8
   workspaces — out of scope here and decoupled from the framework version (the
   lint ruleset need not match the Next major). Tracked as a follow-up.

4. **`serverComponentsExternalPackages` / `outputFileTracingRoot`** from ADR-0013
   carry over unchanged; argon2 stays externalized.

### Vitest 4

5. **Mock constructors must be constructable functions.** Vitest 4 builds mock
   implementations via `Reflect.construct`, and **arrow functions are not
   constructable**. Mocks for classes that the code `new`s — the Resend / ACS /
   Graph SDK clients and the worker's `croner` `Cron` — were arrow-implemented
   (`vi.fn().mockImplementation(() => ({…}))`) and threw "not a constructor".
   Converted to regular `function` expressions (`vi.fn(function () { return …; })`).

6. **`@digest/shared` declares the DOM lib.** The shared package used the global
   `URL` (in the http(s) URL guards) but had no `@types/node` and relied on a
   transitive one that the Vitest 4 dependency change shifted out of scope. It now
   sets `"lib": ["ES2022", "DOM"]` so `URL` (a universal runtime global) resolves
   explicitly — more robust than depending on a transitive type.

## Consequences

- **Positive:** current Next 16 + Vitest 4 (+ React 19). No application behaviour
  change. The bundler/lint/proxy choices keep the diff small and the gate green.
- **Verification:** type-check clean across all 9 workspaces; **1106 tests pass**
  (no `DATABASE_URL`); lint clean; production `next build --webpack` **compiles
  successfully**; and `next dev --webpack` boots and serves `/api/health`,
  `/login`, and `/archive/*` (the CI smoke path) with no module-resolution errors.
- **Tracked follow-ups (all deliberate deferrals):**
  1. **Turbopack** — migrate by dropping `.js` import specifiers across `@digest/*`
     packages (or a future Turbopack `extensionAlias` equivalent), then remove
     `--webpack`.
  2. **ESLint 9 + flat config** — to adopt `eslint-config-next@16`.
  3. The non-fatal jose/Edge `DecompressionStream` warning from next-auth persists.
