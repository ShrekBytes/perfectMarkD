// ─────────────────────────────────────────────────────────────────────────────
// Zoom contract (ticket canvas/zoom-contract): the canvas owns the default —
// fit-to-width until the user takes over — and the zoom readout is the
// "true pixels" action. The unit suite covers the pill's wiring in jsdom;
// these tests prove the real Chromium behavior: real layout, real
// ResizeObserver, real fit math.
// ─────────────────────────────────────────────────────────────────────────────
import { expect, test } from '@playwright/test';
import {
  firstPageBoxWidth,
  openApp,
  waitForCanvasSettled,
  waitForMinPages,
} from './helpers';

/** The mounted frame's visible width — page px × zoom (A4 = 794 page px). */
async function firstFrameWidth(page: import('@playwright/test').Page) {
  return page
    .locator('.pm-page-frame')
    .first()
    .evaluate((el) => el.clientWidth);
}

test('the canvas auto-fits on first paint and the readout shows the fit', async ({
  page,
}) => {
  await openApp(page);
  await waitForCanvasSettled(page);
  await waitForMinPages(page, 1);

  // Default 1280px viewport: canvas ≈ 1280 − editor(38% = 486) −
  // inspector(320) ≈ 474 → fit ≈ (474 − 48) / 794 ≈ 54% — true pixels would
  // be 794, so the fit must be strictly below it.
  const scrollWidth = await page
    .getByTestId('canvas-scroll')
    .evaluate((el) => el.clientWidth);
  const frameWidth = await firstFrameWidth(page);
  const expectedFit = ((scrollWidth - 48) / 794) * 100;
  expect(frameWidth).toBeLessThan(794);
  expect(frameWidth).toBeCloseTo((expectedFit / 100) * 794, -1);

  await expect(page.getByTestId('zoom-level')).toHaveText(
    new RegExp(`^${Math.round(expectedFit)}%$`),
  );
});

test('clicking the readout snaps to true pixels (100%)', async ({ page }) => {
  await openApp(page);
  await waitForCanvasSettled(page);
  await waitForMinPages(page, 1);

  const readout = page
    .getByTestId('zoom-pill')
    .getByRole('button', { name: /Zoom to actual size/ });
  await readout.click();

  await expect(page.getByTestId('zoom-level')).toHaveText('100%');
  // A4 at true pixels: the frame is exactly the page's 794px width.
  expect(await firstFrameWidth(page)).toBeCloseTo(794, 0);
  expect(await firstPageBoxWidth(page)).toBeCloseTo(794, 0);
});

test('after takeover the zoom is frozen across viewport resizes', async ({
  page,
}) => {
  await openApp(page);
  await waitForCanvasSettled(page);
  await waitForMinPages(page, 1);

  await page
    .getByTestId('zoom-pill')
    .getByRole('button', { name: /Zoom to actual size/ })
    .click();
  await expect(page.getByTestId('zoom-level')).toHaveText('100%');

  // Shrink hard, staying in the wide layout (860px+): a pre-takeover canvas
  // would re-fit; the taken-over zoom must not move, and the page may overflow
  // its canvas horizontally.
  await page.setViewportSize({ width: 900, height: 700 });
  await page.waitForTimeout(250);
  await expect(page.getByTestId('zoom-level')).toHaveText('100%');
  expect(await firstFrameWidth(page)).toBeCloseTo(794, 0);
});
