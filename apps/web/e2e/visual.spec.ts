// ─────────────────────────────────────────────────────────────────────────────
// Visual regression of the Paper Canvas (ticket editor-app/10): screenshots in
// light and dark at two viewport sizes, plus the shell's pane-layout contract
// as structural assertions (widths, separators) so a pane regression fails
// with a readable diff and not just pixels.
// ─────────────────────────────────────────────────────────────────────────────
import { expect, test } from '@playwright/test';
import { openApp, waitForCanvasSettled, waitForMinPages } from './helpers';

/** The two viewports the ticket pins. Baselines are per theme × viewport. */
const VIEWPORTS = [
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1920, height: 1080 },
] as const;

async function screenshotCanvas(
  page: import('@playwright/test').Page,
  theme: 'light' | 'dark',
  viewport: (typeof VIEWPORTS)[number],
): Promise<void> {
  await openApp(page);
  await waitForMinPages(page, 2);

  if (theme === 'dark') {
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  }

  // Fit the page to the canvas so the full sheet is in frame at both sizes;
  // the resulting zoom is deterministic per viewport.
  await page.getByRole('button', { name: 'Fit page width' }).click();
  await waitForCanvasSettled(page);

  await expect(
    page.getByLabel('Paper Canvas', { exact: true }),
  ).toHaveScreenshot(`canvas-${theme}-${viewport.name}.png`, {
    animations: 'disabled',
    maxDiffPixelRatio: 0.02,
  });
}

for (const viewport of VIEWPORTS) {
  test.describe(`paper canvas visuals — ${viewport.name} ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test(`light theme (${viewport.name})`, async ({ page }) => {
      await screenshotCanvas(page, 'light', viewport);
    });

    test(`dark theme (${viewport.name})`, async ({ page }) => {
      await screenshotCanvas(page, 'dark', viewport);
    });
  });
}

test.describe('pane layout contract', () => {
  test('editor ≈ 38%, inspector 320px, canvas takes the rest', async ({
    page,
  }) => {
    await openApp(page);
    await waitForMinPages(page, 2);

    const shell = await page.getByTestId('shell-content').boundingBox();
    // exact: substring matching would also hit "Resize/Collapse editor pane".
    const editor = await page
      .getByLabel('Editor pane', { exact: true })
      .boundingBox();
    const inspector = await page
      .getByLabel('Inspector pane', { exact: true })
      .boundingBox();
    const canvas = await page
      .getByLabel('Paper Canvas', { exact: true })
      .boundingBox();
    expect(shell).not.toBeNull();
    expect(editor).not.toBeNull();
    expect(inspector).not.toBeNull();
    expect(canvas).not.toBeNull();

    // The layout contract (editor-app spec / pane-layout.ts): editor defaults
    // to 38% of the shell, the inspector is a fixed 320px column, and the
    // canvas absorbs what remains.
    const shellWidth = shell!.width;
    expect(Math.abs(editor!.width - shellWidth * 0.38)).toBeLessThan(16);
    expect(Math.abs(inspector!.width - 320)).toBeLessThan(4);
    expect(canvas!.width).toBeGreaterThanOrEqual(320);

    // Both pane dividers are present.
    await expect(
      page.getByRole('separator', { name: 'Resize editor pane' }),
    ).toBeVisible();
    await expect(
      page.getByRole('separator', { name: 'Resize inspector pane' }),
    ).toBeVisible();
  });
});
