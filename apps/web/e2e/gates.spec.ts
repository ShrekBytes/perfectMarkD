// ─────────────────────────────────────────────────────────────────────────────
// Gated controls (ticket editor-app/10): the paid-feature controls show their
// locks in every Inspector tab, and a lock opens the pricing modal. billing/04
// wired the locks to the entitlement flags from GET /api/me — this run is
// signed out, and signed-out users never gain gates, so the locked view is
// still the standing one here.
// ─────────────────────────────────────────────────────────────────────────────
import { expect, test } from '@playwright/test';
import { openApp, openInspectorTab, waitForMinPages } from './helpers';

test('gated controls show locks that open the pricing modal', async ({
  page,
}) => {
  await openApp(page);
  await waitForMinPages(page, 1); // the Inspector needs an active document

  const modal = page.getByTestId('pricing-modal');

  // Page tab: custom size + background image
  await openInspectorTab(page, 'Page');
  await expect(
    page.getByRole('button', { name: 'Custom size (mm) (paid feature)' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Background image (paid feature)' }),
  ).toBeVisible();

  // Style tab: custom fonts + custom stylesheet
  await openInspectorTab(page, 'Style');
  await expect(
    page.getByRole('button', { name: 'Custom fonts (paid feature)' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Custom stylesheet (paid feature)' }),
  ).toBeVisible();

  // Header/Footer tab: one banner lock per band
  await openInspectorTab(page, 'Header-Footer');
  await expect(
    page.getByRole('button', { name: 'Banner image (paid feature)' }),
  ).toHaveCount(2);

  // A lock opens the pricing modal; Escape closes it again.
  await openInspectorTab(page, 'Page');
  await page
    .getByRole('button', { name: 'Custom size (mm) (paid feature)' })
    .click();
  await expect(modal).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
});

test('switching a band off disables and dims its fields', async ({ page }) => {
  await openApp(page);
  await waitForMinPages(page, 1);
  await openInspectorTab(page, 'Header-Footer');

  const headerText = page.getByRole('textbox', { name: 'Header text' });
  const showHeader = page.getByRole('checkbox', {
    name: 'Show header',
    exact: true,
  });

  // Defaults: the header band is on and editable.
  await expect(showHeader).toBeChecked();
  await expect(headerText).toBeEnabled();

  // Switching the band off disables its fields...
  await showHeader.uncheck();
  await expect(headerText).toBeDisabled();
  await expect(
    page.getByRole('checkbox', { name: 'Show header on first page' }),
  ).toBeDisabled();

  // ...dims them to the system's disabled opacity (0.5)...
  await expect(headerText).toHaveCSS('opacity', '0.5');

  // The footer band keeps its own independent state.
  await expect(
    page.getByRole('textbox', { name: 'Footer text' }),
  ).toBeEnabled();

  // Re-checking the band makes its fields editable again (values are
  // preserved by the store; re-checking restores the band, not defaults).
  await showHeader.check();
  await expect(headerText).toBeEnabled();
});
