# ADR-0017 — Turbopack migration (drop `.js` import specifiers)

- **Status:** Accepted
- **Date:** 2026-06-30
- **Phase:** Maintenance (deferred backlog)
- **Relates to:** [[ADR-0016-next16-vitest4-upgrade]] (which pinned `--webpack` as a deliberate deferral — this lifts that)

## Context

ADR-0016 upgraded to Next 16 but pinned the legacy **webpack** bundler via
`--webpack`, because Next 16's default **Turbopack** could not resolve the
workspace packages' explicit `.js` import specifiers (e.g. `export * from
'./ab-test.js'`) to their `.ts` sources. Webpack handled this via
`resolve.extensionAlias`; Turbopack has no equivalent. The migration to Turbopack
was tracked as a follow-up — this ADR completes it.

## Decision

**Stop using `.js` import specifiers** so Turbopack (and `tsc`, and `tsx`) resolve
modules without an alias hack.

1. **`tsconfig.base.json`: `module` NodeNext → `preserve`, `moduleResolution`
   NodeNext → `bundler`.** NodeNext *mandates* `.js` extensions on relative ESM
   imports; `bundler` resolution allows **extensionless** relative imports and
   resolves them to `.ts`, which is what every consumer here actually is (the
   packages are consumed from source — their `exports` point at `./src/index.ts` —
   via Next `transpilePackages` and the worker's `tsx`, never as built `.js`). The
   packages have no emit step, so changing their module strategy is free.

2. **Stripped `.js` from every relative and `@/`-alias specifier** across
   `packages/*` and `apps/*` — in `import`/`export … from`, dynamic `import()`,
   and `vi.mock()` — roughly 428 specifiers across ~145 files. Package specifiers
   that point at genuine `.js` files (e.g. `next/constants.js`) were left intact
   (the transform only matched `./`, `../`, and `@/` prefixes).

3. **Removed the webpack config + `--webpack` pin.** `next.config.mjs` drops the
   `webpack` block (the `extensionAlias` and the argon2 `externals` hack); argon2
   stays externalized via the bundler-agnostic `serverExternalPackages`. The web
   `dev`/`build` scripts and the Playwright smoke config no longer pass
   `--webpack`, so Next 16 uses Turbopack by default.

## Consequences

- **Positive:** the web app now builds and dev-runs on **Turbopack** (Next 16's
  default and the actively-developed bundler); the legacy webpack escape hatch and
  the `.js`-specifier discipline are both gone. No application behaviour change.
- **Verification:** type-check clean across all 9 workspaces; **1106 tests pass**
  (no `DATABASE_URL`); lint clean; **Turbopack production build compiles**; and
  Turbopack `next dev` boots (~0.4 s) and serves `/api/health`, `/login`, and
  `/archive/*` (the CI smoke path).
- **Trade-off — module-resolution strictness:** `bundler` resolution is more
  lenient than NodeNext (it no longer enforces real-Node ESM rules). This is the
  correct model for a bundler/tsx-consumed monorepo, but means the packages are no
  longer validated as if run by bare Node. Acceptable: nothing here runs the
  source through bare Node.
- **Known cosmetic warning:** the Turbopack build emits 3 non-fatal warnings about
  a dynamic `path.resolve(process.cwd(), …)` in `apps/web/lib/candidates.ts` — a
  runtime filesystem path for reading the candidate pool, not a module import. It
  does not fail the build; a `/* turbopackIgnore: true */` annotation could silence
  it if desired.
- **Remaining tracked follow-up:** ESLint 9 + flat config (to adopt
  `eslint-config-next@16`); the jose/Edge `DecompressionStream` warning from
  next-auth.
