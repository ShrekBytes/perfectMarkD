// ─────────────────────────────────────────────────────────────────────────────
// The Docs page (docs-page spec; ai-transforms/02): /docs renders its
// sections from the single markdown source through the engine's renderer, the
// section nav is generated from those headings, and the Stylesheet tab's
// footer link lands on the styling reference without losing the open
// Document. Static content — the API server isn't needed; the round-trip
// test unlocks the Custom Stylesheet via the shared /api/me interception.
// ─────────────────────────────────────────────────────────────────────────────
import { expect, test } from '@playwright/test';
import {
  moveToEditorEnd,
  openApp,
  openInspectorTab,
  typeAtEditorEnd,
  unlockAsPro,
} from './helpers';

test('the docs page renders its sections and the generated section nav', async ({
  page,
}) => {
  await page.goto('/docs');
  const main = page.getByRole('main');

  await expect(
    main.getByRole('heading', { name: 'Docs', level: 1 }),
  ).toBeVisible();
  // Rendered from the single markdown source through the engine's renderer —
  // first, middle, and the engine-owned last section.
  await expect(
    main.getByRole('heading', { name: 'Getting started' }),
  ).toBeVisible();
  await expect(
    main.getByRole('heading', { name: 'Math, diagrams, and tables' }),
  ).toBeVisible();
  await expect(
    main.getByRole('heading', { name: 'Styling reference' }),
  ).toBeVisible();

  // The nav is generated from the rendered headings, so it lists every
  // section — first and last shown here.
  const nav = main.getByRole('navigation', { name: 'Sections' });
  await expect(
    nav.getByRole('link', { name: 'Getting started' }),
  ).toBeVisible();
  await expect(
    nav.getByRole('link', { name: 'Styling reference' }),
  ).toBeVisible();
});

test('the section nav scrolls to the styling reference', async ({ page }) => {
  await page.goto('/docs');
  const nav = page.getByRole('navigation', { name: 'Sections' });
  await nav.getByRole('link', { name: 'Styling reference' }).click();

  await expect(page).toHaveURL(/\/docs#styling-reference$/);
  await expect(
    page.getByRole('heading', { name: 'Styling reference' }),
  ).toBeInViewport();
});

test('/docs#styling-reference deep-links straight to the section', async ({
  page,
}) => {
  // The Stylesheet tab's footer link target: the section scrolls into view
  // once the rendered content has landed.
  await page.goto('/docs#styling-reference');
  const heading = page.getByRole('heading', { name: 'Styling reference' });
  await expect(heading).toBeVisible();
  await expect(heading).toBeInViewport();
});

test("the Stylesheet tab's reference link keeps the open Document", async ({
  page,
}) => {
  await unlockAsPro(page);
  await openApp(page);
  await typeAtEditorEnd(page, '\n\nRound trip marker.');
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  // Bisect: the marker is in the editor before any navigation happens.
  await expect(page.locator('.cm-content')).toContainText('Round trip marker.');

  await openInspectorTab(page, 'Stylesheet');
  await page.getByRole('link', { name: 'Styling reference' }).click();
  await expect(page).toHaveURL(/\/docs#styling-reference$/);
  await expect(
    page.getByRole('heading', { name: 'Styling reference' }),
  ).toBeVisible();

  // Back to the editor: the same Document, marker included — the router swap
  // never lost it. CodeMirror virtualizes its lines, so bring the document
  // tail into the DOM before reading it.
  await page.goBack();
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  await page.locator('.cm-content').click();
  await moveToEditorEnd(page);
  await expect(page.locator('.cm-content')).toContainText('Round trip marker.');
});
