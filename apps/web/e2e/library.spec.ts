// ─────────────────────────────────────────────────────────────────────────────
// Library panel (ticket editor-app/10): create/rename/delete (delete is
// undoable within the toast window), and the .md import → export round trip.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { openApp, waitForMinPages } from './helpers';

function libraryOf(page: import('@playwright/test').Page) {
  return page.getByRole('dialog', { name: 'Library' });
}

test('creates, renames, and deletes a document; undo restores it', async ({
  page,
}) => {
  await openApp(page);
  const library = libraryOf(page);

  // Create
  await page.getByRole('button', { name: 'Library' }).click();
  await expect(library).toBeVisible();
  await library.getByRole('button', { name: 'New document' }).click();
  await expect(library).toBeHidden(); // creating closes the drawer
  await expect(page.getByLabel('Document name')).toHaveValue(
    'Untitled document',
  );

  // Rename (row action button → inline input)
  await page.getByRole('button', { name: 'Library' }).click();
  await library
    .getByRole('button', { name: 'Rename Untitled document' })
    .click();
  const renameBox = library.getByLabel('Rename document');
  await renameBox.fill('Smoke Notes');
  await renameBox.press('Enter');
  await expect(
    library.getByRole('button', { name: 'Open Smoke Notes' }),
  ).toBeVisible();
  await expect(page.getByLabel('Document name')).toHaveValue('Smoke Notes');

  // Delete → confirmation toast with Undo; the row disappears
  await library.getByRole('button', { name: 'Delete Smoke Notes' }).click();
  await expect(page.getByTestId('delete-toast')).toContainText(
    'Deleted Smoke Notes',
  );
  await expect(
    library.getByRole('button', { name: 'Open Smoke Notes' }),
  ).toBeHidden();

  // Undo restores the document
  await page
    .getByTestId('delete-toast')
    .getByRole('button', { name: 'Undo' })
    .click();
  await expect(
    library.getByRole('button', { name: 'Open Smoke Notes' }),
  ).toBeVisible();
});

test('imports a .md file and exports it back byte-identical', async ({
  page,
}) => {
  await openApp(page);
  const library = libraryOf(page);
  const fixturePath = fileURLToPath(
    new URL('./fixtures/round-trip.md', import.meta.url),
  );

  // Import (the chooser flow the hidden file input drives)
  await page.getByRole('button', { name: 'Library' }).click();
  await expect(library).toBeVisible();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    library.getByRole('button', { name: 'Import .md' }).click(),
  ]);
  await chooser.setFiles(fixturePath);

  // The import opens the new document; the engine paginates it.
  await expect(page.getByLabel('Document name')).toHaveValue('round-trip');
  await waitForMinPages(page, 2);

  // Export from the library row and compare bytes with the source file.
  await page.getByRole('button', { name: 'Library' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    library.getByRole('button', { name: 'Export round-trip' }).click(),
  ]);
  const exported = readFileSync(await download.path(), 'utf8');
  expect(exported).toBe(readFileSync(fixturePath, 'utf8'));
});
