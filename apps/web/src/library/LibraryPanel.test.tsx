// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
});
