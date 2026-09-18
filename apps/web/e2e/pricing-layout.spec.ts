import { expect, test, type Page } from '@playwright/test';

async function expectComparisonFits(page: Page) {
  const table = page.getByRole('table', { name: 'Compare plans' });
  await expect(table).toBeVisible();
  const overflow = await table.evaluate((element) => ({
    table: element.scrollWidth - element.clientWidth,
    left: element.getBoundingClientRect().left,
    right: element.getBoundingClientRect().right - window.innerWidth,
  }));
  expect(overflow.table).toBeLessThanOrEqual(1);
  expect(overflow.left).toBeGreaterThanOrEqual(0);
  expect(overflow.right).toBeLessThanOrEqual(0);
  for (const name of ['Free', 'Pro', 'Premium']) {
    const header = table.getByRole('columnheader', {
      name: new RegExp(`^${name} `),
    });
    await expect(header).toBeVisible();
    const box = await header.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  await expect(table.getByRole('rowheader')).toHaveCount(11);
  // Explicit associations survive the CSS grid presentation on narrow screens.
  expect(
    await table
      .locator('td')
      .first()
      .evaluate((cell) =>
        cell
          .getAttribute('headers')!
          .split(' ')
          .every((id) => document.getElementById(id)),
      ),
  ).toBe(true);
}

for (const width of [320, 375, 768, 1280]) {
  test(`pricing page and modal fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/pricing');
    await expectComparisonFits(page);
    await page
      .getByRole('button', { name: 'Upgrade', exact: true })
      .first()
      .click();
    await expect(
      page.getByRole('dialog', { name: 'Upgrade to Pro' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');

    await page.goto('/');
    if (width < 860) {
      await page
        .getByRole('button', { name: 'Inspector', exact: true })
        .click();
    }
    await page
      .getByRole('button', { name: 'Custom size (mm) (paid feature)' })
      .click();
    await expectComparisonFits(page);
    await page
      .getByRole('button', { name: 'Upgrade', exact: true })
      .last()
      .click();
    await expect(
      page.getByRole('dialog', { name: 'Upgrade to Premium' }),
    ).toBeVisible();
  });
}
