// ─────────────────────────────────────────────────────────────────────────────
// Launch chrome (spec .scratch/launch-chrome/spec.md): the shared footer on
// the non-editor surfaces, the About and Privacy pages, and a 404 for unknown
// paths. Static content only — the API server isn't needed for any of it.
// ─────────────────────────────────────────────────────────────────────────────
import { expect, test, type Page } from '@playwright/test';

/** The single origin the suite's own web server serves (playwright.config). */
const BASE_ORIGIN = 'http://localhost:4173';

/** The shared footer — the only contentinfo on each non-editor surface. */
function footerOf(page: Page) {
  return page.getByRole('contentinfo');
}

test('the About page renders its story, contact, and CTAs', async ({
  page,
}) => {
  await page.goto('/about');
  const main = page.getByRole('main');

  await expect(
    main.getByRole('heading', { name: 'About PerfectMarkD' }),
  ).toBeVisible();
  // The successor story: the Advanced PDF Export plugin it replaces.
  await expect(main.getByText(/platform-independent successor/)).toBeVisible();
  await expect(
    main.getByRole('heading', { name: 'Free software, AGPL-3.0' }),
  ).toBeVisible();
  // Contact info: GitHub in the AGPL section, the email in Contact.
  await expect(main.getByText('shrebytes@duck.com')).toBeVisible();

  // CTAs to the editor and pricing — working links, not decoration.
  await expect(
    main.getByRole('link', { name: 'Open the editor' }),
  ).toBeVisible();
  await main.getByRole('link', { name: 'See pricing' }).click();
  await expect(
    page.getByRole('heading', { name: 'Simple pricing' }),
  ).toBeVisible();
});

test('the Privacy page renders what is stored and what is never done', async ({
  page,
}) => {
  await page.goto('/privacy');
  const main = page.getByRole('main');

  await expect(main.getByRole('heading', { name: 'Privacy' })).toBeVisible();

  // What is stored: account email, Export History PDFs (30 days), payment
  // reference.
  await expect(main.getByText(/account email/)).toBeVisible();
  await expect(main.getByText(/kept 30 days/)).toBeVisible();
  await expect(main.getByText(/transaction ID/)).toBeVisible();

  // Analytics (launch/01): self-hosted, and the page says what it collects
  // and what it does with the address rather than leaving it implied.
  await expect(main.getByRole('heading', { name: 'Analytics' })).toBeVisible();
  await expect(main.getByText(/running on our own server/)).toBeVisible();
  await expect(main.getByText(/never stored/)).toBeVisible();

  // What is never done: no third-party analytics or tracking; PDF content
  // never used for anything.
  await expect(main.getByText(/No third-party analytics/)).toBeVisible();
  await expect(main.getByText(/never read, used, or shared/)).toBeVisible();

  // Manual crypto payment keeps card data out of the service entirely.
  await expect(main.getByText(/No card data is held/)).toBeVisible();

  // The self-host escape hatch and the no-warranty caveat.
  await expect(main.getByText(/run your own instance/)).toBeVisible();
  await expect(main.getByText(/no warranty/)).toBeVisible();
});

/**
 * The posture the Privacy page promises: nothing here loads anything from
 * another company's server. Analytics is self-hosted and same-origin, so this
 * audit stays green with it on or off — it exists to catch the next script
 * tag, font, or image that would quietly break the claim.
 */
test('the public surfaces request nothing from another origin', async ({
  page,
}) => {
  const foreign: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.origin !== BASE_ORIGIN) {
      foreign.push(request.url());
    }
  });

  for (const path of ['/', '/pricing', '/privacy', '/about', '/docs']) {
    await page.goto(path);
  }
  await page.waitForLoadState('networkidle');

  expect(foreign).toEqual([]);
});

test('an unknown route renders the 404 with a working link back to the editor', async ({
  page,
}) => {
  await page.goto('/this/path/does/not/exist');

  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible();

  const back = page.getByRole('link', { name: 'Open the editor' });
  await expect(back).toBeVisible();
  await back.click();

  // The link swaps views through the History API: the editor is live once
  // the sample's first save lands.
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  expect(new URL(page.url()).pathname).toBe('/');
});

for (const path of [
  '/pricing',
  '/about',
  '/privacy',
  '/docs',
  '/definitely-not-a-page',
]) {
  test(`the footer renders with its links at ${path}`, async ({ page }) => {
    await page.goto(path);
    const footer = footerOf(page);
    await expect(footer).toBeVisible();

    // The pricing page's original colophon, preserved in the shared footer.
    await expect(footer.getByRole('link', { name: 'AGPL-3.0' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'GitHub' })).toBeVisible();
    await expect(
      footer.getByRole('link', { name: /Advanced PDF Export plugin/ }),
    ).toBeVisible();

    // Links to the static surfaces (Docs joined via the docs-page spec).
    await expect(footer.getByRole('link', { name: 'Pricing' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Docs' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'About' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Privacy' })).toBeVisible();
  });
}
