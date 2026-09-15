// ─────────────────────────────────────────────────────────────────────────────
// The compact shell (adapt pass): below the three panes' own minimum width the
// workspace shows one pane at a time behind an explicit switcher.
//
// The regression this guards is the reason the layout exists: the three-pane
// row is a fixed 860px minimum, and the shell root is `overflow-hidden`, so at
// phone and tablet-portrait widths the row was clipped with no scroll path to
// the hidden panes — the Inspector, and the Export action in the bar, were
// simply unreachable.
// ─────────────────────────────────────────────────────────────────────────────
import { expect, test } from '@playwright/test';
import { openApp, waitForMinPages } from './helpers';

/** Every element that could reintroduce the clipped-overflow bug. */
async function horizontalOverflow(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const width = (element: Element) => element.scrollWidth - element.clientWidth;
    const shell = document.querySelector('[data-testid="shell-content"]')!;
    const header = document.querySelector('header')!;
    return {
      document: document.documentElement.scrollWidth - window.innerWidth,
      header: width(header),
      shell: width(shell),
    };
  });
}

test.describe('compact shell', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('fits the phone: nothing clipped, one pane, Export in the bar', async ({
    page,
  }) => {
    await openApp(page);
    await waitForMinPages(page, 1);

    const overflow = await horizontalOverflow(page);
    expect(overflow.document).toBeLessThanOrEqual(0);
    expect(overflow.header).toBeLessThanOrEqual(0);
    expect(overflow.shell).toBeLessThanOrEqual(0);

    await expect(page.getByTestId('pane-switcher')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Editor' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // The primary action stays in the bar, inside the viewport.
    const exportBox = await page.getByTestId('export-split').boundingBox();
    expect(exportBox).not.toBeNull();
    expect(exportBox!.x + exportBox!.width).toBeLessThanOrEqual(390);

    // One pane is showing; the canvas is mounted but not the visible one, so
    // the preview keeps rendering while the user writes.
    await expect(page.getByLabel('Editor pane', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Paper Canvas', { exact: true })).toBeHidden();
  });

  test('switches to the Paper view with the whole sheet on the bench', async ({
    page,
  }) => {
    await openApp(page);
    await waitForMinPages(page, 1);

    await page.getByRole('button', { name: 'Paper' }).click();

    await expect(page.getByLabel('Paper Canvas', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Editor pane', { exact: true })).toBeHidden();

    const sheet = await page.locator('.pm-page-frame').first().boundingBox();
    expect(sheet).not.toBeNull();
    expect(sheet!.x).toBeGreaterThanOrEqual(0);
    expect(sheet!.x + sheet!.width).toBeLessThanOrEqual(390);
  });

  test('reaches every Inspector field in its own view', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Inspector' }).click();

    await expect(page.getByTestId('inspector-tab-Page')).toBeVisible();
    const paneOverflow = await page.evaluate(() => {
      const pane = document.querySelector('[aria-label="Inspector pane"]')!;
      return pane.scrollWidth - pane.clientWidth;
    });
    expect(paneOverflow).toBeLessThanOrEqual(0);
  });

  test('opens the pricing modal with its close button on screen', async ({
    page,
  }) => {
    await openApp(page);

    await page.getByRole('button', { name: 'More export options' }).click();
    await page.getByRole('menuitem', { name: /Server Export/ }).click();

    await expect(page.getByTestId('pricing-modal')).toBeVisible();

    // The trap this guards: a centred panel taller than the phone put the
    // heading and the close button above the viewport with no way to reach them.
    const close = await page.getByRole('button', { name: 'Close' }).boundingBox();
    expect(close).not.toBeNull();
    expect(close!.y).toBeGreaterThanOrEqual(0);
    expect(close!.y + close!.height).toBeLessThanOrEqual(844);
  });

  test('keeps the overflow menu inside the viewport at 320px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 812 });
    await openApp(page);

    await page.getByRole('button', { name: 'More', exact: true }).click();
    await expect(page.getByRole('menu', { name: 'More' })).toBeVisible();

    // The trap this guards: the menu is 224px wide but the trigger sits ~44px
    // from the bar's right edge, so a trigger-anchored dropdown hung half its
    // labels off the viewport's left edge at the smallest supported width.
    const menu = page.getByRole('menu', { name: 'More' });
    const box = await menu.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  });
});

test('crosses to the three-pane row exactly at the panes’ minimum width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 1100 });
  await openApp(page);

  // Tablet portrait: still one pane at a time, still nothing clipped.
  await expect(page.getByTestId('pane-switcher')).toBeVisible();
  await expect(
    page.getByRole('separator', { name: 'Resize editor pane' }),
  ).toBeHidden();
  expect((await horizontalOverflow(page)).shell).toBeLessThanOrEqual(0);

  // 860px is 280 + 320 + 260: the row fits its own minimums, so the desktop
  // layout takes over — resizable columns and a visible Inspector.
  await page.setViewportSize({ width: 900, height: 1100 });
  await expect(page.getByTestId('pane-switcher')).toBeHidden();
  await expect(
    page.getByRole('separator', { name: 'Resize editor pane' }),
  ).toBeVisible();
  await expect(page.getByLabel('Inspector pane', { exact: true })).toBeVisible();
  expect((await horizontalOverflow(page)).shell).toBeLessThanOrEqual(0);
});
