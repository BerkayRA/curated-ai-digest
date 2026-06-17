/**
 * Accessibility specs using @axe-core/playwright.
 *
 * Asserts no "serious" or "critical" axe violations on:
 *   /login          — unauthenticated public page
 *   /issues         — authenticated archive page
 *
 * Impact levels checked: critical, serious.
 * Informational (minor, moderate) violations are logged but do not fail.
 *
 * Run on desktop-1024 only — a11y rules are not breakpoint-specific.
 *
 * Written as CommonJS (.js) — see e2e/helpers/auth.js for rationale.
 */

'use strict';

const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { loginAsAdmin } = require('./helpers/auth');

test.use({ viewport: { width: 1024, height: 768 } });

/**
 * Runs axe and asserts no critical/serious violations.
 *
 * @param {import('axe-core').AxeResults} axeResults
 */
async function assertNoBlockingViolations(axeResults) {
  const blocking = axeResults.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );

  if (blocking.length > 0) {
    const summary = blocking
      .map((v) => `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} node(s))`)
      .join('\n  ');
    // Use soft-assert so all violations appear in one report.
    expect.soft(blocking, `Accessibility violations:\n  ${summary}`).toHaveLength(0);
  }
  expect(blocking).toHaveLength(0);
}

const CHECKED_RULES = [
  'color-contrast',
  'label',
  'duplicate-id',
  'aria-roles',
  'button-name',
  'form-field-multiple-labels',
  'image-alt',
  'input-button-name',
  'link-name',
  'list',
  'listitem',
];

test.describe('Accessibility: /login', () => {
  test('no critical or serious axe violations', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Hoş Geldiniz' })).toBeVisible();

    const results = await new AxeBuilder({ page })
      // Run only the rules we want to assert on (avoids noise from unrelated rules).
      .withRules(CHECKED_RULES)
      .analyze();

    await assertNoBlockingViolations(results);
  });
});

test.describe('Accessibility: /issues (authenticated)', () => {
  test('no critical or serious axe violations', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/issues');
    await expect(page.getByRole('heading', { name: 'Arşiv' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withRules([
        ...CHECKED_RULES,
        'table-duplicate-name',
        'th-has-data-cells',
        'td-headers-attr',
        'scope-attr-valid',
      ])
      .analyze();

    await assertNoBlockingViolations(results);
  });
});
