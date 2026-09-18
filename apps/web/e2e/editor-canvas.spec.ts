// ─────────────────────────────────────────────────────────────────────────────
// Editor → canvas wiring (ticket editor-app/10): typing re-paginates after the
// render debounce; preset and page-size changes re-style/re-lay-out the
// mounted pages.
// ─────────────────────────────────────────────────────────────────────────────
import { expect, test } from '@playwright/test';
import {
  RENDER_TIMEOUT,
  firstPageBoxWidth,
  openApp,
  openInspectorTab,
  pageBoxStyle,
  pageSlots,
  typeAtEditorEnd,
  waitForMinPages,
} from './helpers';

test('typing text changes the page count after the render debounce', async ({
  page,
}) => {
  await openApp(page);
  const before = await waitForMinPages(page, 2);

  // A `///` Page Break marker forces the next content onto a new page:
  // three of them change the page count deterministically, regardless of
  // font metrics.
  await typeAtEditorEnd(
    page,
    '\n\n///\n\nA brand-new section for the smoke suite.\n\n///\n\nAnd another page.\n\n///\n\nAnd a third.',
  );

  await expect
    .poll(() => pageSlots(page).count(), { timeout: RENDER_TIMEOUT })
    .toBeGreaterThan(before);
});

test('changing the style preset re-styles the mounted pages', async ({
  page,
}) => {
  await openApp(page);
  await waitForMinPages(page, 2);

  const before = await pageBoxStyle(page, 'background-color');
  await openInspectorTab(page, 'Style');
  const gallery = page.getByRole('radiogroup', { name: 'Preset' });
  await gallery.getByRole('radio', { name: 'Dark' }).click();
  await expect(gallery.getByRole('radio', { name: 'Dark' })).toBeChecked();

  // The preset's page background lands in the mounted shadow-DOM page box.
  await expect
    .poll(() => pageBoxStyle(page, 'background-color'))
    .not.toBe(before);
});

test('changing the page size re-lays out the mounted pages', async ({
  page,
}) => {
  await openApp(page);
  await waitForMinPages(page, 2);

  // True page pixels, independent of the canvas's fit-on-load zoom:
  // A4 is 794 CSS px wide, Letter is 816px.
  expect(await firstPageBoxWidth(page)).toBeCloseTo(794, 0);

  await openInspectorTab(page, 'Page');
  await page
    .getByRole('combobox', { name: 'Page size' })
    .selectOption('Letter');

  await expect.poll(() => firstPageBoxWidth(page)).toBeCloseTo(816, 0);
});
