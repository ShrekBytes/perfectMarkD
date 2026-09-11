// ─────────────────────────────────────────────────────────────────────────────
// Gated controls (ticket editor-app/10): the paid-feature controls show their
// locks in every Inspector tab, and a lock opens the pricing modal (the
// Phase-1 inert gate billing/04 will later wire to real entitlements).
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
    page.getByRole('button', { name: 'Custom size (paid feature)' }),
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
    .getByRole('button', { name: 'Custom size (paid feature)' })
    .click();
  await expect(modal).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
});
