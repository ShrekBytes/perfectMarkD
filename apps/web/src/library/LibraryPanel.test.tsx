// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbApi from '../documents/db';
import {
  resetDocumentStoreForTests,
  useDocumentStore,
} from '../documents/store';
import { stubBroadcastChannel } from '../testing/stub-broadcast-channel';
import { stubIndexedDB } from '../testing/stub-idb';
import { downloadMarkdown } from './download';
import { LibraryPanel } from './LibraryPanel';

vi.mock('./download', () => ({ downloadMarkdown: vi.fn() }));

const onClose = vi.fn();

async function seedDocs() {
  const store = useDocumentStore.getState();
  await store.createDocument();
  store.updateActive({ name: 'Second', markdown: '# two' });
  await store.flush();
  await store.openDocument(useDocumentStore.getState().docs[1]!.id);
  store.updateActive({ name: 'First', markdown: '# one' });
  await store.flush();
}

beforeEach(async () => {
  vi.clearAllMocks();
  stubIndexedDB();
  stubBroadcastChannel().reset();
  localStorage.clear();
  resetDocumentStoreForTests();
  await useDocumentStore.getState().init();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('LibraryPanel', () => {
  it('lists documents by recency with names and relative times', async () => {
    await seedDocs();
    render(<LibraryPanel onClose={onClose} />);

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('First');
    expect(rows[0]).toHaveTextContent('just now');
    expect(rows[1]).toHaveTextContent('Second');
  });

  it('opens a document on row click and closes the panel', async () => {
    await seedDocs();
    render(<LibraryPanel onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Open Second' }));

    expect(useDocumentStore.getState().activeId).toBe(
      useDocumentStore.getState().docs.find((row) => row.name === 'Second')!.id,
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('creates a new document and closes the panel', async () => {
    render(<LibraryPanel onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'New document' }));

    expect(useDocumentStore.getState().docs).toHaveLength(2);
    expect(onClose).toHaveBeenCalled();
  });

  it('renames inline: Enter commits, Escape cancels', async () => {
    await seedDocs();
    render(<LibraryPanel onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Rename First' }));
    const input = screen.getByLabelText('Rename document');
    await userEvent.clear(input);
    await userEvent.type(input, 'Renamed{Enter}');

    expect(
      useDocumentStore.getState().docs.find((row) => row.name === 'Renamed'),
    ).toBeDefined();

    await userEvent.click(
      screen.getByRole('button', { name: 'Rename Second' }),
    );
    const input2 = screen.getByLabelText('Rename document');
    await userEvent.clear(input2);
    await userEvent.type(input2, 'Should not stick{Escape}');

    expect(
      useDocumentStore.getState().docs.find((row) => row.name === 'Second'),
    ).toBeDefined();
    expect(
      useDocumentStore
        .getState()
        .docs.find((row) => row.name === 'Should not stick'),
    ).toBeUndefined();
  });

  it('duplicates a document', async () => {
    await seedDocs();
    render(<LibraryPanel onClose={onClose} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Duplicate First' }),
    );

    // The duplicate lands after an async IndexedDB write.
    await waitFor(() => {
      expect(
        useDocumentStore
          .getState()
          .docs.find((row) => row.name === 'First copy'),
      ).toBeDefined();
    });
  });

  it('exports a document as .md', async () => {
    await seedDocs();
    render(<LibraryPanel onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Export First' }));

    expect(downloadMarkdown).toHaveBeenCalledWith('First.md', '# one');
  });

  it('deletes a document and queues the undo toast', async () => {
    await seedDocs();
    render(<LibraryPanel onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Delete First' }));

    // The row disappears once the async IndexedDB delete lands.
    await waitFor(() => {
      expect(useDocumentStore.getState().docs.map((row) => row.name)).toEqual([
        'Second',
      ]);
    });
    expect(useDocumentStore.getState().deleteToast?.doc.name).toBe('First');
  });

  it('offers every row action through the coarse-pointer kebab menu', async () => {
    await seedDocs();
    render(<LibraryPanel onClose={onClose} />);

    // Touch has no hover, so the icon row is unreachable there; the kebab
    // menu is the twin and must reach the same actions.
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for First' }),
    );
    const menu = screen.getByRole('menu', { name: 'Actions for First' });

    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Delete' }),
    );
    await waitFor(() => {
      expect(useDocumentStore.getState().docs.map((row) => row.name)).toEqual([
        'Second',
      ]);
    });
    expect(useDocumentStore.getState().deleteToast?.doc.name).toBe('First');
    // The menu resolved with the action.
    expect(
      screen.queryByRole('menu', { name: 'Actions for First' }),
    ).not.toBeInTheDocument();
  });

  it('renames through the coarse-pointer kebab menu', async () => {
    await seedDocs();
    render(<LibraryPanel onClose={onClose} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for Second' }),
    );
    await userEvent.click(
      within(
        screen.getByRole('menu', { name: 'Actions for Second' }),
      ).getByRole('menuitem', { name: 'Rename' }),
    );
    await userEvent.clear(screen.getByLabelText('Rename document'));
    await userEvent.type(
      screen.getByLabelText('Rename document'),
      'Via menu{Enter}',
    );

    expect(
      useDocumentStore
        .getState()
        .docs.find((row) => row.name === 'Via menu'),
    ).toBeDefined();
  });

  it('closes the kebab menu on Escape and returns focus to its trigger', async () => {
    await seedDocs();
    render(<LibraryPanel onClose={onClose} />);

    const trigger = screen.getByRole('button', { name: 'Actions for First' });
    await userEvent.click(trigger);
    expect(
      screen.getByRole('menu', { name: 'Actions for First' }),
    ).toBeInTheDocument();

    // The menu layer sits above the drawer, so Escape closes the menu only.
    await userEvent.keyboard('{Escape}');
    expect(
      screen.queryByRole('menu', { name: 'Actions for First' }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(screen.getByTestId('library-panel')).toBeInTheDocument();
  });

  it('dismisses an open kebab menu on an outside press', async () => {
    await seedDocs();
    render(<LibraryPanel onClose={onClose} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for First' }),
    );
    expect(
      screen.getByRole('menu', { name: 'Actions for First' }),
    ).toBeInTheDocument();

    // Pressing another row's kebab closes the first menu before its own
    // click opens the second.
    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for Second' }),
    );
    expect(
      screen.queryByRole('menu', { name: 'Actions for First' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('menu', { name: 'Actions for Second' }),
    ).toBeInTheDocument();
  });

  it('imports a chosen .md file as a new document', async () => {
    render(<LibraryPanel onClose={onClose} />);

    const file = new File(['# Imported body'], 'trip-report.md', {
      type: 'text/markdown',
    });
    await userEvent.upload(screen.getByLabelText('Import markdown file'), file);

    const state = useDocumentStore.getState();
    expect(state.name).toBe('trip-report');
    expect(state.markdown).toBe('# Imported body');
    expect(onClose).toHaveBeenCalled();
  });

  it('persists a rename to storage for a non-active document', async () => {
    await seedDocs();
    render(<LibraryPanel onClose={onClose} />);
    const secondId = useDocumentStore
      .getState()
      .docs.find((row) => row.name === 'Second')!.id;

    await userEvent.click(
      screen.getByRole('button', { name: 'Rename Second' }),
    );
    await userEvent.clear(screen.getByLabelText('Rename document'));
    await userEvent.type(
      screen.getByLabelText('Rename document'),
      'Persisted{Enter}',
    );

    const reader = await dbApi.openDatabase();
    expect((await dbApi.getDocument(reader, secondId))?.name).toBe('Persisted');
    reader.close();
  });

  it('keeps the thumbnail in place while the name becomes a rename input', async () => {
    await seedDocs();
    render(<LibraryPanel onClose={onClose} />);
    const firstRow = screen
      .getAllByTestId('row-meta')[0]!
      .closest('li') as HTMLElement;
    const thumbBefore = firstRow.querySelector('div[aria-hidden="true"]');

    await userEvent.click(screen.getByRole('button', { name: 'Rename First' }));

    const input = screen.getByLabelText('Rename document');
    expect(input).toBeInTheDocument();
    const thumbAfter = firstRow.querySelector('div[aria-hidden="true"]');
    expect(thumbAfter).toBe(thumbBefore);
  });

  it('shows no count on rows the canvas has not reported', async () => {
    await seedDocs();
    render(<LibraryPanel onClose={onClose} />);

    for (const meta of screen.getAllByTestId('row-meta')) {
      // Absence, not an estimate.
      expect(meta.textContent).not.toMatch(/page/);
    }
  });

  it('shows the true page count on the meta line once reported', async () => {
    await seedDocs();
    act(() => {
      useDocumentStore.getState().recordPageCount(12);
    });
    render(<LibraryPanel onClose={onClose} />);

    expect(screen.getAllByTestId('row-meta')[0]).toHaveTextContent(
      'just now · 12 pages',
    );

    act(() => {
      useDocumentStore.getState().recordPageCount(1);
    });
    expect(screen.getAllByTestId('row-meta')[0]).toHaveTextContent(
      'just now · 1 page',
    );
  });

  it('draws a leading miniature sheet on every row', async () => {
    await seedDocs();
    render(<LibraryPanel onClose={onClose} />);

    // Each row leads with the sketch; the footprint geometry (page size,
    // orientation, custom sizes) is the footprint's own unit test
    // (library/thumb.test.ts).
    for (const meta of screen.getAllByTestId('row-meta')) {
      expect(
        meta.closest('li')!.querySelector('div[aria-hidden="true"]'),
      ).toBeInTheDocument();
    }
  });
});
