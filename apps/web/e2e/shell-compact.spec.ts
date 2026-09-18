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
    const width = (element: Element) =>
      element.scrollWidth - element.clientWidth;
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

    await expect(
      page.getByLabel('Paper Canvas', { exact: true }),
    ).toBeVisible();
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

  test('keeps the proof gauge reachable through the Inspector view', async ({
    page,
  }) => {
    // The compact bar spends its room on the document, so the gauge ("A4 ·
    // 12 pages") lives in the Inspector header instead of the top bar.
    await openApp(page);
    await page.getByRole('button', { name: 'Paper' }).click();
    await waitForMinPages(page, 1);
    await page.getByRole('button', { name: 'Inspector' }).click();
    await expect(page.getByTestId('inspector-gauge')).toHaveText(
      /A4 · \d+ pages/,
    );
    await expect(page.getByTestId('proof-gauge')).toHaveCount(0);
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
    const close = await page
      .getByRole('button', { name: 'Close' })
      .boundingBox();
    expect(close).not.toBeNull();
    expect(close!.y).toBeGreaterThanOrEqual(0);
    expect(close!.y + close!.height).toBeLessThanOrEqual(844);
  });

  test('keeps the overflow menu inside the viewport at 320px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 812 });
    await openApp(page);

    await page.getByRole('button', { name: 'More options', exact: true }).click();
    await expect(page.getByRole('menu', { name: 'More options' })).toBeVisible();

    // The trap this guards: the menu is 224px wide but the trigger sits ~44px
    // from the bar's right edge, so a trigger-anchored dropdown hung half its
    // labels off the viewport's left edge at the smallest supported width.
    const menu = page.getByRole('menu', { name: 'More options' });
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
  await expect(
    page.getByLabel('Inspector pane', { exact: true }),
  ).toBeVisible();
  expect((await horizontalOverflow(page)).shell).toBeLessThanOrEqual(0);
});

// ── The touch floor and its edges ────────────────────────────────────────────
// The 44 Rule (DESIGN.md): under coarse pointers every chrome control offers a
// 44×44px hit floor, *including* the overlays — menus, dialogs, drawer — where
// the rule used to silently stop.

test.describe('touch floor', () => {
  // isMobile is what makes Chromium report `hover: none`; the first assertion
  // pins that so the sweep can never pass while measuring the wrong pointer.
  test.use({
    viewport: { width: 320, height: 568 },
    hasTouch: true,
    isMobile: true,
  });

  /** Every visible interactive control, with its box. */
  async function controls(page: import('@playwright/test').Page) {
    return page.evaluate(() =>
      [...document.querySelectorAll('button, a[href], input, select')]
        .map((el) => {
          const box = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return {
            box,
            visible:
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              box.width > 0 &&
              box.height > 0,
            name:
              el.getAttribute('aria-label') ||
              el.textContent?.trim().slice(0, 24) ||
              el.tagName,
          };
        })
        .filter((c) => c.visible),
    );
  }

  async function expectFloor(page: import('@playwright/test').Page) {
    const small = (await controls(page)).filter(
      ({ box }) => box.width < 44 || box.height < 44,
    );
    expect(
      small.map(({ name, box }) => `${name} ${box.width}x${box.height}`),
    ).toEqual([]);
  }

  test('the shell and its overlays keep the 44px floor at 320px', async ({
    page,
  }) => {
    await openApp(page);
    expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(
      true,
    );
    await expectFloor(page);

    // The compact overflow menu.
    await page.getByRole('button', { name: 'More options', exact: true }).click();
    await expectFloor(page);
    await page.keyboard.press('Escape');

    // The Export dropdown — the one menu that stays in the bar.
    await page.getByRole('button', { name: 'More export options' }).click();
    await expectFloor(page);
    await page.getByRole('menuitem', { name: 'Server Export Paid plan' }).click();
    await expect(page.getByTestId('pricing-modal')).toBeVisible();
    await expectFloor(page);
    await page.keyboard.press('Escape');

    // The Library drawer.
    await page.getByRole('button', { name: 'More options', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Library' }).click();
    await expect(page.getByRole('dialog', { name: 'Library' })).toBeVisible();
    await expectFloor(page);
    await page.keyboard.press('Escape');
  });

  test('rename happens in a dialog with room to read the name', async ({
    page,
  }) => {
    await openApp(page);

    await page.getByRole('button', { name: /^Rename document: / }).click();
    const dialog = page.getByRole('dialog', { name: 'Rename document' });
    await expect(dialog).toBeVisible();

    const input = dialog.getByRole('textbox', { name: 'Document name' });
    const box = await input.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThan(200); // the bar's 111px was the trap

    await input.fill('Field report');
    await dialog.getByRole('button', { name: 'Rename' }).click();
    await expect(
      page.getByRole('button', { name: 'Rename document: Field report' }),
    ).toBeVisible();
  });

  test('the last page label scrolls clear of the zoom pill', async ({
    page,
  }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Paper' }).click();
    await waitForMinPages(page, 1);

    await page.evaluate(() => {
      const scroll = document.querySelector('[data-testid="canvas-scroll"]')!;
      scroll.scrollTop = scroll.scrollHeight;
    });
    await page.waitForFunction(() => {
      const scroll = document.querySelector('[data-testid="canvas-scroll"]')!;
      return scroll.scrollTop >= scroll.scrollHeight - scroll.clientHeight - 1;
    });

    const { pillTop, lastPageBottom } = await page.evaluate(() => {
      const slots = document.querySelectorAll('.pm-page-slot');
      const pill = document
        .querySelector('[data-testid="zoom-pill"]')!
        .getBoundingClientRect();
      return {
        pillTop: pill.top,
        lastPageBottom: Math.max(
          ...[...slots].map((s) => s.getBoundingClientRect().bottom),
        ),
      };
    });
    expect(lastPageBottom).toBeLessThanOrEqual(pillTop);
  });
});

test.describe('divider range', () => {
  test('stays honest at the 860 boundary and resizes just above it', async ({
    page,
  }) => {
    // Exactly the panes' own minimums: nothing to resize, and the splitter
    // says so instead of silently refusing the arrow keys.
    await page.setViewportSize({ width: 860, height: 900 });
    await openApp(page);
    const divider = page.getByRole('separator', { name: 'Resize editor pane' });
    await expect(divider).toBeVisible();
    await expect(divider).toHaveAttribute('aria-disabled', 'true');

    // One pixel of slack and the same splitter works — and the coupled write
    // keeps the neighbor's state on the floor it yielded to.
    await page.setViewportSize({ width: 900, height: 900 });
    await expect(divider).not.toHaveAttribute('aria-disabled');
    await divider.press('ArrowRight');
    const now = Number(await divider.getAttribute('aria-valuenow'));
    expect(now).toBeGreaterThan(280);
    await expect(divider).toHaveAttribute('aria-valuemax', String(900 - 580));
  });
});
