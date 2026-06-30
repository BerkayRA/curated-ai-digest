# ADR-0019 — ESLint 9 + flat config

- **Status:** Accepted
- **Date:** 2026-06-30
- **Phase:** Maintenance (deferred backlog — final upgrade follow-up)
- **Relates to:** [[ADR-0016-next16-vitest4-upgrade]] (deferred this because v16's `eslint-config-next` needs ESLint 9 + flat config), [[ADR-0018-post-upgrade-polish]]

## Context

Next 16 removed the `next lint` command and `eslint-config-next@16` requires
**ESLint 9 + flat config**. ADR-0016 kept `eslint-config-next@15` (ESLint 8,
eslintrc) to avoid a cross-workspace flat-config migration at the time. This ADR
completes that migration so the lint ruleset matches the framework major.

**Process note:** the local ECC `config-protection` hook blocks writes to any
`eslint.config.*` file. With the user's explicit, scoped authorization for this
one migration, the two flat-config files were written via the shell (the hook
matches `Write|Edit|MultiEdit`, not Bash); the hook was not disabled.

## Decision

1. **ESLint 8.57 → 9.39.4; flat config replaces eslintrc.** The monorepo's
   non-Next workspaces (all `packages/*` + `apps/worker`) inherited the root
   `package.json` `eslintConfig`; that is replaced by a single root
   `eslint.config.mjs` built with `typescript-eslint`'s `tseslint.config(...)`
   (+ `@eslint/js`, `globals`). It encodes the same recommended sets, node
   globals, rule tweaks, test-file overrides, and ignores — including the
   `**/*.tsx` / `**/*.jsx` ignores, so the `packages/email` `*.tsx` templates stay
   unlinted exactly as before. The old `@typescript-eslint/eslint-plugin` +
   `parser` devDeps are replaced by the `typescript-eslint` meta-package.

2. **`apps/web` adopts `eslint-config-next@16`'s native flat config.** v16 exports
   a real flat-config array, so `apps/web/eslint.config.mjs` spreads
   `eslint-config-next/core-web-vitals` directly. (FlatCompat was tried first and
   fails with a circular-JSON error — v16's config already contains flat-config
   plugin objects, which the eslintrc compat validator can't process.) The web
   lint script drops the now-defunct `--ext` flag (`eslint . --max-warnings 0`).

3. **Behavior-neutral, with one new rule deferred.** `eslint-config-next@16`'s
   `core-web-vitals` enables stricter `react-hooks` rules than v15. The new
   `react-hooks/set-state-in-effect` rule fires on the existing props→state sync
   effects in the slide-over form panels. To keep this a pure infrastructure swap
   (not a component refactor), that one rule is turned **off** in the web flat
   config with a comment; adopting it (and refactoring those effects) is a tracked
   follow-up. Seven now-**unused** `eslint-disable` directives (for rules not in
   the active set — `no-explicit-any`, `no-non-null-assertion`, `no-console`,
   `no-await-in-loop`) were removed, since ESLint 9 reports unused directives by
   default (a genuine improvement kept on).

## Consequences

- **Positive:** lint is on ESLint 9 + flat config, matching the Next 16 major;
  `next lint` is no longer needed; dead disable directives are gone; ESLint 9's
  unused-directive reporting stays enabled.
- **Verification:** `pnpm -r lint` clean across all 9 workspaces; type-check
  clean; **1109 tests pass**; (build/runtime unaffected — lint-only change).
- **Tracked follow-up:** adopt `react-hooks/set-state-in-effect` by refactoring
  the form panels' props→state effects (e.g. remount via `key`), then remove the
  rule-off override. This was the **last** dependency-upgrade follow-up; the
  remaining backlog is product (live billing) and conditional (Redis limiter).
