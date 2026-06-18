/**
 * Shared authentication helpers for Playwright E2E tests.
 *
 * Written as CommonJS (.js) because Node 20.4.0 lacks module.register,
 * which Playwright 1.61 needs to bootstrap its TypeScript ESM transform.
 * Plain JS avoids that limitation entirely.
 */

'use strict';

const { expect } = require('@playwright/test');

const TEST_EMAIL = 'e2e-admin@curated-ai-digest.test';
const TEST_PASSWORD = 'Test1234!';

/**
 * Log in as the local admin and assert landing on the dashboard.
 * Uses role/label selectors — no data-testid required.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function loginAsAdmin(page) {
  await page.goto('/login');

  await page.getByLabel('E-posta').fill(TEST_EMAIL);
  await page.getByLabel('Şifre').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Giriş Yap' }).click();

  // Successful login redirects to /issues (root → /issues redirect).
  await page.waitForURL('**/issues', { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Arşiv' })).toBeVisible();
}

module.exports = { loginAsAdmin, TEST_EMAIL, TEST_PASSWORD };
