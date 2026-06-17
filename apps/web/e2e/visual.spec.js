/**
 * Visual regression tests.
 *
 * Captures `toHaveScreenshot()` baselines for the key dashboard pages at all
 * configured brand breakpoints (320, 375, 768, 1024, 1440).
 *
 * First run:  `pnpm test:e2e:update`  — generates baseline PNGs under
 *             e2e/**-snapshots/ (gitignored; machine-specific).
 * Subsequent: `pnpm test:e2e`         — diffs against those baselines.
 *
 * Pages covered:
 *   /login          (unauthenticated — public)
 *   /issues         (authenticated)
 *   /subscribers    (authenticated)
 *   /settings       (authenticated)
 *
 * Written as CommonJS (.js) — see e2e/helpers/auth.js for rationale.
 */

'use strict';

const { test, expect } = require('@playwright/test');
const { loginAsAdmin } = require('./helpers/auth');

// ── Snapshot options ─────────────────────────────────────────────────────────
// Threshold and max-diff-pixels are intentionally loose: the CI render
// environment may differ slightly from the developer's machine. Tighten
// once baseline images are committed to a shared artifact store.
/** @type {import('@playwright/test').PageScreenshotOptions} */
const SNAP_OPTS = {
  maxDiffPixelRatio: 0.03, // allow up to 3 % pixel difference
};

// ── /login ───────────────────────────────────────────────────────────────────
test.describe('Visual: /login', () => {
  test('login page matches snapshot', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Hoş Geldiniz' })).toBeVisible();
    await expect(page).toHaveScreenshot('login.png', SNAP_OPTS);
  });
});

// ── /issues ──────────────────────────────────────────────────────────────────
test.describe('Visual: /issues', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('issues page matches snapshot', async ({ page }) => {
    await page.goto('/issues');
    await expect(page.getByRole('heading', { name: 'Arşiv' })).toBeVisible();
    // Wait for network to settle so dynamic content is stable.
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('issues.png', SNAP_OPTS);
  });
});

// ── /subscribers ─────────────────────────────────────────────────────────────
test.describe('Visual: /subscribers', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('subscribers page matches snapshot', async ({ page }) => {
    await page.goto('/subscribers');
    await expect(page.getByRole('heading', { name: 'Aboneler' })).toBeVisible();
    // Wait for client-side hydration of the subscribers table.
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('subscribers.png', SNAP_OPTS);
  });
});

// ── /settings ────────────────────────────────────────────────────────────────
test.describe('Visual: /settings', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('settings page matches snapshot', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Ayarlar' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('settings.png', SNAP_OPTS);
  });
});
