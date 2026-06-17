/**
 * Unauthenticated access specs.
 *
 * These run without any session cookie. They verify:
 *   - Page routes that require auth redirect to /login.
 *   - Protected API routes return 401.
 *   - Public endpoints (/api/health, /unsubscribe) are reachable.
 *
 * We only need one viewport here (desktop-1024) because auth behaviour
 * is not viewport-dependent. Visual regression files cover all breakpoints.
 *
 * Written as CommonJS (.js) — see e2e/helpers/auth.js for rationale.
 */

'use strict';

const { test, expect } = require('@playwright/test');

test.describe('Unauthenticated access', () => {
  // ── Root redirect ──────────────────────────────────────────────────────────
  test('GET / redirects to /login', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    // After redirect chain settles, we must be on /login.
    expect(page.url()).toContain('/login');
    // The login heading must be visible.
    await expect(page.getByRole('heading', { name: 'Hoş Geldiniz' })).toBeVisible();
  });

  // ── Protected page routes ─────────────────────────────────────────────────
  test('GET /issues redirects to /login', async ({ page }) => {
    await page.goto('/issues', { waitUntil: 'load' });
    expect(page.url()).toContain('/login');
  });

  test('GET /subscribers redirects to /login', async ({ page }) => {
    await page.goto('/subscribers', { waitUntil: 'load' });
    expect(page.url()).toContain('/login');
  });

  test('GET /settings redirects to /login', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'load' });
    expect(page.url()).toContain('/login');
  });

  // ── Protected API routes ──────────────────────────────────────────────────
  test('GET /api/issues returns 401 without session', async ({ request }) => {
    const response = await request.get('/api/issues');
    expect(response.status()).toBe(401);
    const body = await response.json();
    // Middleware returns { success: false, error: 'Unauthorized' }
    expect(body.success).toBe(false);
  });

  // ── Public endpoints ──────────────────────────────────────────────────────
  test('GET /api/health returns 200 with { status: ok }', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('/unsubscribe with no token renders invalid-link page (not redirected to /login)', async ({ page }) => {
    await page.goto('/unsubscribe', { waitUntil: 'load' });
    // Must NOT be redirected to /login.
    expect(page.url()).not.toContain('/login');
    // Shows the "invalid link" message — token was missing.
    await expect(page.getByRole('heading', { name: 'Geçersiz Bağlantı' })).toBeVisible();
  });

  test('/unsubscribe with unknown token renders not-found state (not redirected to /login)', async ({ page }) => {
    await page.goto('/unsubscribe?token=non-existent-token-xyz', { waitUntil: 'load' });
    expect(page.url()).not.toContain('/login');
    await expect(page.getByRole('heading', { name: 'Bağlantı Bulunamadı' })).toBeVisible();
  });
});
