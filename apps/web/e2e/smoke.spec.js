/**
 * CI smoke spec — login page renders.
 *
 * This is the ONLY spec the e2e-smoke CI job runs (via playwright.smoke.config.cjs).
 * It is deliberately free of screenshots / visual assertions so it stays green
 * before the visual-regression snapshots used by the full suite are baselined.
 *
 * GET /login under AUTH_MODE=local renders the branded credentials form with no
 * database access, so a dummy DATABASE_URL is sufficient for this check.
 *
 * Written as CommonJS (.js) — see e2e/helpers/auth.js for the rationale (Node
 * 20.4.0 lacks module.register, which Playwright needs for its TS ESM transform).
 */

'use strict';

const { test, expect } = require('@playwright/test');

test.describe('Login page', () => {
  test('@smoke renders the branded sign-in card', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'load' });

    // Stable heading copy from the redesigned login page.
    await expect(page.getByRole('heading', { name: 'Hoş Geldiniz' })).toBeVisible();

    // Official Mega Bilgisayar logo, identified by its alt text.
    await expect(
      page.getByAltText('Mega Bilgisayar Tic. Ltd. Şti'),
    ).toBeVisible();
  });
});
