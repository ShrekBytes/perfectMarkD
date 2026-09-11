// ─────────────────────────────────────────────────────────────────────────────
// Fresh-profile onboarding (ticket editor-app/10): a first visit seeds the
// sample document and the render pipeline turns it into paginated pages; a
// reload lands back on the same document without re-seeding.
// ─────────────────────────────────────────────────────────────────────────────
import { expect, test } from '@playwright/test';
import { libraryOf, openApp, pageSlots, waitForMinPages } from './helpers';

test('first run opens the sample document and renders multiple pages', async ({
  page,
}) => {
  await openApp(page);

  // The sample is auto-created, opened, and named in the top bar.
  await expect(page.getByLabel('Document name')).toHaveValue(
    'Welcome to PerfectMarkD',
  );

  // The welcome strip offers the "start blank" way out.
  await expect(page.getByTestId('welcome-strip')).toContainText(
    'This is a sample',
  );

  // The sample paginates beyond one page (the ticket's bar): the whole
  // pipeline is wired end to end — markdown → KaTeX/Shiki/mermaid →
  // paginate → shadow-DOM pages.
  const pages = await waitForMinPages(page, 2);

  // Labels advertise position within the document ("Page N of M").
  await expect(page.locator('.pm-page-label').last()).toHaveText(
    `Page ${pages} of ${pages}`,
  );
});

test('a reload lands back on the sample without re-seeding it', async ({
  page,
}) => {
  await openApp(page);
  await waitForMinPages(page, 2);

  await page.reload();
  await expect(page.getByLabel('Document name')).toHaveValue(
    'Welcome to PerfectMarkD',
  );
  await waitForMinPages(page, 2);

  // The library holds exactly one document — the sample was created once.
  const library = libraryOf(page);
  await page.getByRole('button', { name: 'Library' }).click();
  await expect(library).toBeVisible();
  await expect(library.getByRole('listitem')).toHaveCount(1);
  await expect(pageSlots(page)).not.toHaveCount(0);
});
