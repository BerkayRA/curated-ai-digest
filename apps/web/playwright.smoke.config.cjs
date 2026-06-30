/**
 * CI-safe SMOKE Playwright configuration for @digest/web.
 *
 * Differences from playwright.config.cjs (the full visual-regression suite):
 *   - Boots `next dev` (NOT `next start`), so NO prebuilt .next is required.
 *   - Uses Playwright's bundled Chromium (channel: undefined), NOT system Chrome,
 *     so it runs on a clean CI runner via `playwright install chromium`.
 *   - Runs a single project / single spec with NO visual snapshots.
 *
 * It deliberately reuses the SAME boot env keys as the full config so the app
 * starts in local-auth mode. GET /login needs no database, so DATABASE_URL is
 * a harmless dummy value here.
 *
 * Written as a CommonJS module (.cjs) for the same reason as the full config:
 * Node 20.4 lacks module.register, so Playwright cannot transform a TS config.
 */

const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const PORT = 3102;
const BASE_URL = `http://localhost:${PORT}`;
const E2E_DIR = path.join(__dirname, 'e2e');

module.exports = defineConfig({
  testDir: E2E_DIR,
  // Only the smoke spec — never the visual or auth specs.
  testMatch: ['smoke.spec.js'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      // Bundled Chromium — channel undefined overrides devices['Desktop Chrome'].
      use: { ...devices['Desktop Chrome'], channel: undefined },
    },
  ],

  webServer: {
    // `next dev` needs no separate build step; the smoke job has no prebuilt .next.
    // Env is passed via the `env` block (not inline) to match the full config.
    // `--webpack`: Next 16 defaults to Turbopack, which can't resolve the
    // workspace packages' `.js`→`.ts` specifiers (see next.config.mjs); pin webpack.
    command: `node_modules/.bin/next dev --webpack -p ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    // Generous timeout: a cold `next dev` compiles the first route on demand.
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    cwd: __dirname,
    env: {
      AUTH_MODE: 'local',
      AUTH_SECRET: 'ci-smoke-secret-for-curated-ai-digest-playwright-only',
      // Dummy — GET /login does not touch the database.
      DATABASE_URL: 'postgresql://digest:digest@localhost:5432/curated_ai_digest_smoke',
      APP_BASE_URL: BASE_URL,
    },
  },
});
