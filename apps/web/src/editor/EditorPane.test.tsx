// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { EditorView } from '@codemirror/view';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EditorPane } from './EditorPane';
import { MAX_ASSET_BYTES } from '../assets/ingest';
import { getAsset, openDatabase } from '../documents/db';
import {
  resetDocumentStoreForTests,
  useDocumentStore,
} from '../documents/store';
import { stubBroadcastChannel } from '../testing/stub-broadcast-channel';
import { stubClientRects } from '../testing/stub-client-rects';
import { stubIndexedDB } from '../testing/stub-idb';
import { pngFile } from '../testing/test-assets';

beforeEach(async () => {
  localStorage.clear();
  stubIndexedDB();
  stubBroadcastChannel().reset();
  stubClientRects();
  resetDocumentStoreForTests();
  await useDocumentStore.getState().init();
  // First run seeds the sample document; these tests exercise a blank one.
  await useDocumentStore.getState().createDocument();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The mounted CodeMirror view, recovered from its DOM. */
function editorView(): EditorView {
  const el = document.querySelector('.cm-editor');
  if (!el) throw new Error('editor not mounted');
  return EditorView.findFromDOM(el as HTMLElement)!;
}

async function setMarkdown(markdown: string) {
  act(() => {
    useDocumentStore.setState({ markdown });
  });
}

it('renders the toolbar contract', () => {
  render(<EditorPane />);

  expect(
    screen.getByRole('toolbar', { name: 'Editor formatting' }),
  ).toBeInTheDocument();
  for (const label of [
    'Bold',
    'Italic',
    'Cycle heading level',
    'Bulleted list',
    'Insert table',
    'Insert Page Break',
    'Undo',
    'Redo',
  ]) {
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  }
  // The image picker lives inside the pane; the button opens it.
  const image = screen.getByRole('button', { name: 'Insert image' });
  expect(image).toBeEnabled();
  expect(image).toHaveAttribute(
    'title',
    expect.stringContaining('Insert image'),
  );
});

it('shows the word and character counts in the footer', async () => {
  render(<EditorPane />);
  expect(screen.getByTestId('editor-stats')).toHaveTextContent(
    '0 words · 0 characters',
  );

  await setMarkdown('one two three');
  expect(screen.getByTestId('editor-stats')).toHaveTextContent(
    '3 words · 13 characters',
  );
});

it('shows the placeholder while the document is empty', () => {
  render(<EditorPane />);
  expect(
    screen.getByText('Start writing in Markdown — the paper updates as you type.'),
  ).toBeInTheDocument();
});

it('flows editor changes into the store', async () => {
  const user = userEvent.setup();
  render(<EditorPane />);

  await user.type(editorView().contentDOM, 'x');
  expect(useDocumentStore.getState().markdown).toBe('x');

  await user.click(screen.getByRole('button', { name: 'Bold' }));
  expect(useDocumentStore.getState().markdown).toBe('x****');
});

it('adopts markdown changed outside the editor', async () => {
  render(<EditorPane />);
  await setMarkdown('# From elsewhere');

  expect(editorView().state.doc.toString()).toBe('# From elsewhere');
});

it('does not echo external changes back into the store', async () => {
  render(<EditorPane />);
  await setMarkdown('# From elsewhere');
  await act(async () => {
    await useDocumentStore.getState().flush();
  });

  // An echo would mark the working copy dirty again (saveState 'saving').
  expect(useDocumentStore.getState().saveState).toBe('saved');
  expect(useDocumentStore.getState().markdown).toBe('# From elsewhere');
});

it('flags /// lines as Page Breaks', async () => {
  render(<EditorPane />);
  await setMarkdown('intro\n\n///\n\nmore');

  const flagged = document.querySelectorAll('.cm-page-break');
  expect(flagged).toHaveLength(1);
  expect(flagged[0]).toHaveTextContent('///');
});

it('runs toolbar commands on the editor document', async () => {
  const user = userEvent.setup();
  render(<EditorPane />);
  const click = (label: string) =>
    user.click(screen.getByRole('button', { name: label }));

  await setMarkdown('Title');
  await click('Cycle heading level');
  expect(useDocumentStore.getState().markdown).toBe('# Title');

  await click('Bulleted list');
  expect(useDocumentStore.getState().markdown).toBe('- # Title');

  await setMarkdown('');
  await click('Insert table');
  expect(useDocumentStore.getState().markdown).toContain('| Column 1 |');

  await setMarkdown('');
  await click('Insert Page Break');
  expect(useDocumentStore.getState().markdown).toBe('///\n\n');
});

it('undoes and redoes toolbar edits', async () => {
  const user = userEvent.setup();
  render(<EditorPane />);

  await user.click(screen.getByRole('button', { name: 'Italic' }));
  expect(useDocumentStore.getState().markdown).toBe('**');

  await user.click(screen.getByRole('button', { name: 'Undo' }));
  expect(useDocumentStore.getState().markdown).toBe('');

  await user.click(screen.getByRole('button', { name: 'Redo' }));
  expect(useDocumentStore.getState().markdown).toBe('**');
});

it('wraps the selection with Ctrl+B and reports Ctrl+Enter', async () => {
  const onRequestRender = vi.fn();
  render(<EditorPane onRequestRender={onRequestRender} />);
  const content = editorView().contentDOM;

  await setMarkdown('word');
  fireEvent.keyDown(content, { key: 'a', ctrlKey: true }); // select all
  fireEvent.keyDown(content, { key: 'b', ctrlKey: true });
  await waitFor(() => {
    expect(useDocumentStore.getState().markdown).toBe('**word**');
  });

  fireEvent.keyDown(content, { key: 'Enter', ctrlKey: true });
  expect(onRequestRender).toHaveBeenCalledTimes(1);
});

it('reports the proportional scroll fraction', () => {
  const onEditorScroll = vi.fn();
  render(<EditorPane onEditorScroll={onEditorScroll} />);

  const scrollDOM = editorView().scrollDOM;
  Object.defineProperties(scrollDOM, {
    scrollHeight: { value: 400, configurable: true },
    clientHeight: { value: 100, configurable: true },
    scrollTop: { value: 225, configurable: true, writable: true },
  });

  fireEvent.scroll(scrollDOM);
  expect(onEditorScroll).toHaveBeenLastCalledWith(0.75);
});

// ─── Image handling (ticket 08) ──────────────────────────────────────────────

/** The markdown once the asset ref for `file` has landed, if it landed. */
function assetMarkdown(alt: string): RegExp {
  return new RegExp(`^!\\[${alt}\\]\\(asset:\\/\\/[a-z0-9-]+\\)\\n$`);
}

it('opens the picker from the Insert image button', async () => {
  const user = userEvent.setup();
  render(<EditorPane />);
  const input = screen.getByTestId('image-picker') as HTMLInputElement;
  const click = vi.spyOn(input, 'click');

  await user.click(screen.getByRole('button', { name: 'Insert image' }));
  expect(click).toHaveBeenCalledTimes(1);
});

it('inserts picked images as asset refs and stores them', async () => {
  const user = userEvent.setup();
  render(<EditorPane />);

  await user.upload(screen.getByTestId('image-picker'), pngFile('sunrise.png'));

  await waitFor(() => {
    expect(useDocumentStore.getState().markdown).toMatch(
      assetMarkdown('sunrise'),
    );
  });
  // Round-trip: the asset itself landed in the IndexedDB asset store.
  const ref = /\(asset:\/\/([^)]+)\)/.exec(
    useDocumentStore.getState().markdown,
  )![1]!;
  const reader = await openDatabase();
  const asset = await getAsset(reader, ref);
  expect(asset?.mediaType).toBe('image/png');
  reader.close();
});

it('inserts several picked images on consecutive lines', async () => {
  render(<EditorPane />);

  fireEvent.change(screen.getByTestId('image-picker'), {
    target: { files: [pngFile('one.png'), pngFile('two.png')] },
  });

  await waitFor(() => {
    expect(useDocumentStore.getState().markdown).toMatch(
      /!\[one\]\(asset:\/\/[a-z0-9-]+\)\n!\[two\]\(asset:\/\/[a-z0-9-]+\)\n/,
    );
  });
});

it('pastes a copied image as an asset ref', async () => {
  render(<EditorPane />);

  fireEvent.paste(editorView().contentDOM, {
    clipboardData: { files: [pngFile('shot.png')], getData: () => '' },
  });

  await waitFor(() => {
    expect(useDocumentStore.getState().markdown).toMatch(assetMarkdown('shot'));
  });
});

it('lets text win when the clipboard carries text and an image', async () => {
  render(<EditorPane />);

  fireEvent.paste(editorView().contentDOM, {
    clipboardData: { files: [pngFile('shot.png')], getData: () => 'hello' },
  });

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(useDocumentStore.getState().markdown).not.toMatch(/asset:\/\//);
});

it('drops image files at the drop position', async () => {
  render(<EditorPane />);
  await setMarkdown('abc');
  const view = editorView();
  vi.spyOn(view, 'posAtCoords').mockReturnValue(1);

  fireEvent.drop(view.contentDOM, {
    clientX: 10,
    clientY: 10,
    dataTransfer: { files: [pngFile('sunrise.png')] },
  });

  await waitFor(() => {
    expect(useDocumentStore.getState().markdown).toMatch(
      /^a\n!\[sunrise\]\(asset:\/\/[a-z0-9-]+\)\nbc$/,
    );
  });
});

it('leaves .md drops to the app import path', async () => {
  render(<EditorPane />);

  fireEvent.drop(editorView().contentDOM, {
    clientX: 10,
    clientY: 10,
    dataTransfer: {
      files: [new File(['# Hi'], 'notes.md', { type: 'text/markdown' })],
    },
  });

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(useDocumentStore.getState().markdown).toBe('');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('surfaces the size limit for an oversized image', async () => {
  const user = userEvent.setup();
  render(<EditorPane />);

  await user.upload(
    screen.getByTestId('image-picker'),
    pngFile('big.png', MAX_ASSET_BYTES + 1),
  );

  expect(await screen.findByRole('status')).toHaveTextContent('20 MB');
  expect(useDocumentStore.getState().markdown).toBe('');
});

it('surfaces a notice for non-image files picked by hand', async () => {
  render(<EditorPane />);

  // user-event's upload honors accept="image/*" and would skip the file like
  // a real picker; drive the change event directly to reach ingest validation.
  fireEvent.change(screen.getByTestId('image-picker'), {
    target: {
      files: [
        new File([new Uint8Array(4)], 'notes.pdf', { type: 'application/pdf' }),
      ],
    },
  });

  expect(await screen.findByRole('status')).toHaveTextContent('not an image');
  expect(useDocumentStore.getState().markdown).toBe('');
});
