/**
 * Authentication flow specs.
 *
 * Covers:
 *   - Login page renders with the local-auth form.
 *   - Successful login with correct credentials lands on the dashboard.
 *   - Wrong credentials show an error and stay on /login.
 *   - After login, protected pages (/issues, /subscribers, /settings) render
 *     their expected headings.
 *
 * These run only on desktop-1024 — auth behaviour is viewport-independent.
 * The visual regression suite covers all breakpoints.
 *
 * Written as CommonJS (.js) — see e2e/helpers/auth.js for rationale.
 */

'use strict';

const { test, expect } = require('@playwright/test');
const { loginAsAdmin, TEST_EMAIL, TEST_PASSWORD } = require('./helpers/auth');

// Only run auth specs against a single viewport to keep the suite fast.
test.use({ viewport: { width: 1024, height: 768 } });

test.describe('Login page', () => {
  test('renders the local-auth credentials form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Hoş Geldiniz' })).toBeVisible();
    await expect(page.getByLabel('E-posta')).toBeVisible();
    await expect(page.getByLabel('Şifre')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Giriş Yap' })).toBeVisible();
  });

  test('wrong credentials show an error and stay on /login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('E-posta').fill('wrong@example.com');
    await page.getByLabel('Şifre').fill('wrongpassword');
    await page.getByRole('button', { name: 'Giriş Yap' }).click();

    // Auth.js redirects back to /login?error=CredentialsSignin on failure.
    await page.waitForURL('**/login**', { timeout: 15_000 });
    expect(page.url()).toContain('/login');
    // The Turkish error message must be visible. Target the text directly —
    // getByRole('alert') also matches Next's empty __next-route-announcer__.
    await expect(page.getByText('E-posta veya şifre hatalı')).toBeVisible();
  });
});

test.describe('Authenticated dashboard', () => {
  test('correct credentials land on /issues with the Arşiv heading', async ({ page }) => {
    await loginAsAdmin(page);
    expect(page.url()).toContain('/issues');
    await expect(page.getByRole('heading', { name: 'Arşiv' })).toBeVisible();
  });

  test('/issues page renders the Arşiv heading after login', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/issues');
    await expect(page.getByRole('heading', { name: 'Arşiv' })).toBeVisible();
  });

  test('/subscribers page renders the Aboneler heading and the subscriber table', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/subscribers');
    await expect(page.getByRole('heading', { name: 'Aboneler' })).toBeVisible();
    // The seeded DB has 3 subscribers; the table or the empty-state must render.
    const table = page.getByRole('table', { name: 'Abone listesi' });
    const emptyState = page.getByText('Henüz abone eklenmemiş');
    await expect(table.or(emptyState)).toBeVisible();
  });

  test('/subscribers page shows at least the 3 seeded subscribers', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/subscribers');
    // Wait for the subscriber table to be present.
    await expect(page.getByRole('table', { name: 'Abone listesi' })).toBeVisible();
    const rows = page.getByRole('table', { name: 'Abone listesi' }).getByRole('row');
    // At least 4 rows: 1 header + 3 data rows.
    await expect(rows).toHaveCount(4);
  });

  test('/settings page renders the Ayarlar heading', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Ayarlar' })).toBeVisible();
  });

  test('/settings page renders the settings form sections', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/settings');
    // Seeded settings row means the form sections are rendered, not the fallback.
    await expect(page.getByRole('heading', { name: 'Otomatik Gönderim', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Gönderim Planı', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'E-posta Sağlayıcısı', level: 2 })).toBeVisible();
  });

  test('navigating to / while authenticated redirects to /issues', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/');
    await page.waitForURL('**/issues', { timeout: 10_000 });
    expect(page.url()).toContain('/issues');
  });
});
