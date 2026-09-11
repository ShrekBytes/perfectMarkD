// ─────────────────────────────────────────────────────────────────────────────
// Library panel (ticket editor-app/10): create/rename/delete (delete is
// undoable within the toast window), and the .md import → export round trip.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { openApp, openLibrary, waitForMinPages } from './helpers';

test('creates, renames, and deletes a document; undo restores it', async ({
  page,
}) => {
  await openApp(page);
  const library = await openLibrary(page);

  // Create
  await library.getByRole('button', { name: 'New document' }).click();
  await expect(library).toBeHidden(); // creating closes the drawer
  await expect(page.getByLabel('Document name')).toHaveValue(
    'Untitled document',
  );

  // Rename (row action button → inline input)
  const reopened = await openLibrary(page);
  await reopened
    .getByRole('button', { name: 'Rename Untitled document' })
    .click();
  const renameBox = reopened.getByLabel('Rename document');
  await renameBox.fill('Smoke Notes');
  await renameBox.press('Enter');
  await expect(
    reopened.getByRole('button', { name: 'Open Smoke Notes' }),
  ).toBeVisible();
  await expect(page.getByLabel('Document name')).toHaveValue('Smoke Notes');

  // Delete → confirmation toast with Undo; the row disappears
  await reopened.getByRole('button', { name: 'Delete Smoke Notes' }).click();
  await expect(page.getByTestId('delete-toast')).toContainText(
    'Deleted Smoke Notes',
  );
  await expect(
    reopened.getByRole('button', { name: 'Open Smoke Notes' }),
  ).toBeHidden();

  // Undo restores the document
  await page
    .getByTestId('delete-toast')
    .getByRole('button', { name: 'Undo' })
    .click();
  await expect(
    reopened.getByRole('button', { name: 'Open Smoke Notes' }),
  ).toBeVisible();
});

test('imports a .md file and exports it back byte-identical', async ({
  page,
}) => {
  await openApp(page);
  const fixturePath = fileURLToPath(
    new URL('./fixtures/round-trip.md', import.meta.url),
  );

  // Import (the chooser flow the hidden file input drives)
  const library = await openLibrary(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    library.getByRole('button', { name: 'Import .md' }).click(),
  ]);
  await chooser.setFiles(fixturePath);

  // The import opens the new document; the engine paginates it.
  await expect(page.getByLabel('Document name')).toHaveValue('round-trip');
  await waitForMinPages(page, 2);

  // Export from the library row and compare bytes with the source file.
  const reopened = await openLibrary(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    reopened.getByRole('button', { name: 'Export round-trip' }).click(),
  ]);
  const exported = readFileSync(await download.path(), 'utf8');
  expect(exported).toBe(readFileSync(fixturePath, 'utf8'));
});
