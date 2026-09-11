// ─────────────────────────────────────────────────────────────────────────────
// Appearance (ticket editor-app/10): the dark toggle re-themes the chrome,
// keeps the pages paper-white, and persists across reloads.
// ─────────────────────────────────────────────────────────────────────────────
import { expect, test } from '@playwright/test';
import { openApp, pageBoxStyle, waitForMinPages } from './helpers';

test('dark mode toggles, keeps pages paper-white, and persists', async ({
  page,
}) => {
  await openApp(page);
  await waitForMinPages(page, 2);

  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  // The toggle now offers the way back.
  await expect(
    page.getByRole('button', { name: 'Switch to light theme' }),
  ).toBeVisible();

  // Pages stay white paper in dark mode — only the app chrome re-themes
  // (editor-app spec), so the page box background is unchanged.
  await expect
    .poll(() => pageBoxStyle(page, 'background-color'))
    .toBe('rgb(255, 255, 255)');

  // The choice persists: the pre-paint script re-applies it on reload.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(
    page.getByRole('button', { name: 'Switch to light theme' }),
  ).toBeVisible();
});
