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
import {
  resetDocumentStoreForTests,
  useDocumentStore,
} from '../documents/store';
import { stubBroadcastChannel } from '../testing/stub-broadcast-channel';
import { stubClientRects } from '../testing/stub-client-rects';
import { stubIndexedDB } from '../testing/stub-idb';

beforeEach(async () => {
  localStorage.clear();
  stubIndexedDB();
  stubBroadcastChannel().reset();
  stubClientRects();
  resetDocumentStoreForTests();
  await useDocumentStore.getState().init();
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
  // The image picker arrives with ticket 08; the button waits disabled.
  const image = screen.getByRole('button', { name: 'Insert image' });
  expect(image).toBeDisabled();
  expect(image).toHaveAttribute('title', 'Images — coming soon');
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
    screen.getByText('Start writing — your markdown goes here.'),
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
