/**
 * Playwright E2E configuration for @digest/web.
 *
 * Written as a CommonJS module (.cjs) because the web app's tsconfig uses
 * module: ESNext (required by Next.js App Router). With Node 20.4 (which
 * lacks module.register), Playwright's TypeScript transform cannot be
 * bootstrapped, so a pre-compiled CJS config file is the correct fallback.
 *
 * - Runs against a locally-started `next start` server on port 3101.
 * - Uses AUTH_MODE=local with a known test admin account.
 * - Covers brand breakpoints: 320, 375, 768, 1024, 1440.
 * - Visual-regression screenshots land in e2e/**-snapshots/ (gitignored).
 */

const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const PORT = 3101;
const BASE_URL = `http://localhost:${PORT}`;
const E2E_DIR = path.join(__dirname, 'e2e');

// Stable auth credentials for local testing.
const TEST_EMAIL = 'e2e-admin@curated-ai-digest.test';
const TEST_PASSWORD = 'Test1234!';

// Pre-built argon2id hash of TEST_PASSWORD.
// Regenerate with: node -e "require('./node_modules/argon2').hash('Test1234!').then(h=>process.stdout.write(h))"
const ADMIN_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$tZ89wyZTxh2nMMU7rLPHvw$RdSzH3WYHvkrTqQnZhr3JFPTXV0othW3Q2syn9TwI2w';

module.exports = defineConfig({
  testDir: E2E_DIR,
  fullyParallel: false, // sequential to avoid port conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/results.xml' }],
  ],
  use: {
    baseURL: BASE_URL,
    // Use the locally-installed Google Chrome instead of Playwright's bundled
    // Chromium (avoids the heavy browser download / matches the user's browser).
    channel: 'chrome',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    // — 320px (mobile small) —
    {
      name: 'mobile-320',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 320, height: 568 },
      },
    },
    // — 375px (iPhone) —
    {
      name: 'mobile-375',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
      },
    },
    // — 768px (tablet) —
    {
      name: 'tablet-768',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 },
      },
    },
    // — 1024px (small desktop) —
    {
      name: 'desktop-1024',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1024, height: 768 },
      },
    },
    // — 1440px (large desktop) —
    {
      name: 'desktop-1440',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],

  webServer: {
    // Env is passed via the `env` block below, NOT inline in the command — the
    // argon2 hash contains `$argon2id$v=...` which a shell would expand to empty,
    // mangling the hash and breaking login. Keep the command env-free.
    command: `node_modules/.bin/next start -p ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
    cwd: __dirname,
    env: {
      AUTH_MODE: 'local',
      ADMIN_EMAIL: TEST_EMAIL,
      ADMIN_PASSWORD_HASH: ADMIN_PASSWORD_HASH,
      AUTH_SECRET: 'e2e-test-secret-for-curated-ai-digest-playwright-runs-only',
      DATABASE_URL: 'postgresql://digest:digest@localhost:5433/curated_ai_digest',
      APP_BASE_URL: BASE_URL,
    },
  },
});

// Export test credentials for use in spec helpers.
module.exports.TEST_EMAIL = TEST_EMAIL;
module.exports.TEST_PASSWORD = TEST_PASSWORD;
