import { expect, test, type Page } from '@playwright/test';

import {
  PRICING_FAILURE,
  PRICING_RESPONSE,
} from '../src/testing/pricing-response';

/**
 * GET /api/pricing, the plan prices and limits the surfaces render
 * (live-pricing/01). The suite drives the built SPA with no API behind it, so
 * the read is stubbed here — with the shared fixture the unit suites use, whose
 * figures are not the seeded ones, so a hardcoded price anywhere in the client
 * fails these tests instead of passing on the defaults.
 */
async function stubPricingApi(page: Page) {
  await page.route('**/api/pricing', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(PRICING_RESPONSE),
    }),
  );
}

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
  // Twelve rows: the table gained the AI Allowance (live-pricing/01), which is
  // a real per-plan number the pricing surfaces did not mention before.
  await expect(table.getByRole('rowheader')).toHaveCount(12);
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
    await stubPricingApi(page);
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

test('the rendered prices come from the endpoint, not from constants', async ({
  page,
}) => {
  await stubPricingApi(page);
  await page.goto('/pricing');
  const table = page.getByRole('table', { name: 'Compare plans' });
  await expect(table).toBeVisible();

  // The stubbed figures, and the seeded ones nowhere: a client constant
  // (3 / 7 / 300 / 1000) would fail here rather than pass on the defaults.
  await expect(page.getByTestId('price-pro')).toHaveText('$4.50/mo');
  await expect(page.getByTestId('price-premium')).toHaveText('$9/mo');
  await expect(table.getByRole('row', { name: /AI Allowance/ })).toContainText(
    '150/mo',
  );
  await expect(table.getByRole('row', { name: /AI Allowance/ })).toContainText(
    '800/mo',
  );
  await expect(table).toContainText('450/mo');
  await expect(table).not.toContainText('300/mo');

  // The purchase dialog quotes the same stored figures, including a twelve
  // months that is deliberately not ten times the month.
  await page
    .getByRole('button', { name: 'Upgrade', exact: true })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Upgrade to Pro' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('upgrade-total')).toHaveText('$4.50');
  await dialog.getByRole('button', { name: /12 months/ }).click();
  await expect(dialog.getByTestId('upgrade-total')).toHaveText('$47');
});

test('a failed pricing read shows an unavailable state and no number', async ({
  page,
}) => {
  await page.route('**/api/pricing', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify(PRICING_FAILURE),
    }),
  );
  await page.goto('/pricing');

  const table = page.getByRole('table', { name: 'Compare plans' });
  await expect(page.getByTestId('price-pro')).toHaveText('Unavailable');
  await expect(page.getByTestId('price-premium')).toHaveText('Unavailable');
  // The outage is stated, so a grid of dashes is not read as a plan that
  // includes nothing (story 6).
  await expect(page.getByTestId('pricing-unavailable')).toContainText(
    'could not be loaded',
  );
  // The table is intact and the plan identity is still readable — this is a
  // missing number, not a broken page, and never a fallback to the default.
  await expect(
    table.getByRole('columnheader', { name: /^Premium/ }),
  ).toBeVisible();
  await expect(
    table.getByRole('rowheader', { name: /Priority render queue/ }),
  ).toBeVisible();
  await expect(table).not.toContainText('$');
});
