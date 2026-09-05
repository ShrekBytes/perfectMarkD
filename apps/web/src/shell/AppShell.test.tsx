// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import { STORAGE_KEY } from '../theme/theme';
import {
  resetDocumentStoreForTests,
  useDocumentStore,
} from '../documents/store';
import { stubBroadcastChannel } from '../testing/stub-broadcast-channel';
import { stubIndexedDB } from '../testing/stub-idb';
import { stubSystemTheme } from '../testing/match-media';

/**
 * jsdom performs no layout, so widths read as 0 and every width would clamp to
 * its minimum. Give the shell a virtual width for the drag tests; the editor
 * starts at its 38% default of a 1200px container.
 */
function stubLayoutWidths() {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(456);
}

beforeEach(async () => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  stubSystemTheme('light');
  stubIndexedDB();
  stubBroadcastChannel().reset();
  resetDocumentStoreForTests();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Renders the shell and waits until the seeded document is in the DOM. */
async function renderReadyShell() {
  const result = render(<AppShell />);
  // The save indicator only renders once the store has an active document,
  // so its appearance doubles as the "ready" gate.
  await screen.findByTestId('save-state');
  return result;
}

it('renders the top bar contract: wordmark, doc name, save state, Library, theme toggle, Export', async () => {
  await renderReadyShell();

  // The wordmark is styled across nested spans, so match its full text content.
  expect(screen.getByRole('banner')).toHaveTextContent('PerfectMarkD');
  expect(screen.getByText('Mark')).toHaveClass('text-accent');
  expect(screen.getByRole('textbox', { name: 'Document name' })).toHaveValue(
    'Untitled document',
  );
  expect(screen.getByTestId('save-state')).toHaveTextContent('Saved');
  expect(screen.getByRole('button', { name: 'Library' })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Switch to dark theme' }),
  ).toBeInTheDocument();
  expect(screen.getByTestId('export-split')).toBeInTheDocument();
});

it('renders the three panes with their empty states', async () => {
  await renderReadyShell();

  expect(
    screen.getByRole('complementary', { name: 'Editor pane' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('main', { name: 'Paper Canvas' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('complementary', { name: 'Inspector pane' }),
  ).toBeInTheDocument();
  expect(
    screen.getByText('Your pages will appear here as you write.'),
  ).toBeInTheDocument();
  expect(
    screen.getByText('Start writing — your markdown goes here.'),
  ).toBeInTheDocument();
  expect(
    screen.getByText('Page, style, and header/footer settings live here.'),
  ).toBeInTheDocument();
});

it('renaming in the top bar updates the active document', async () => {
  await renderReadyShell();

  const input = screen.getByRole('textbox', { name: 'Document name' });
  await userEvent.clear(input);
  await userEvent.type(input, 'My essay{Enter}');
  await useDocumentStore.getState().flush();

  expect(useDocumentStore.getState().name).toBe('My essay');
  expect(useDocumentStore.getState().docs[0]?.name).toBe('My essay');
});

it('opens the Library panel from the top bar and closes it with Escape', async () => {
  await renderReadyShell();

  await userEvent.click(screen.getByRole('button', { name: 'Library' }));
  expect(screen.getByRole('dialog', { name: 'Library' })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'New document' }),
  ).toBeInTheDocument();

  await userEvent.keyboard('{Escape}');
  expect(
    screen.queryByRole('dialog', { name: 'Library' }),
  ).not.toBeInTheDocument();
});

it('shows the saving affordance while an edit is pending', async () => {
  await renderReadyShell();

  act(() => {
    useDocumentStore.getState().updateActive({ markdown: 'typing' });
  });
  expect(screen.getByTestId('save-state')).toHaveTextContent('Saving…');

  await act(async () => {
    await useDocumentStore.getState().flush();
  });
  expect(screen.getByTestId('save-state')).toHaveTextContent('Saved');
});

function makeRemotePending() {
  return {
    id: useDocumentStore.getState().activeId!,
    name: 'From elsewhere',
    markdown: '',
    settings: useDocumentStore.getState().settings,
    assetIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

it('shows the staleness banner when another tab changed the active document', async () => {
  await renderReadyShell();

  act(() => {
    useDocumentStore.setState({ remotePending: makeRemotePending() });
  });
  expect(screen.getByTestId('stale-banner')).toHaveTextContent(
    'This document was changed in another tab',
  );

  await userEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
  expect(screen.queryByTestId('stale-banner')).not.toBeInTheDocument();
  expect(useDocumentStore.getState().remotePending).toBeNull();
});

it('loads the remote version from the staleness banner', async () => {
  await renderReadyShell();

  act(() => {
    useDocumentStore.setState({ remotePending: makeRemotePending() });
  });

  await userEvent.click(screen.getByRole('button', { name: 'Load changes' }));
  expect(useDocumentStore.getState().name).toBe('From elsewhere');
  expect(screen.queryByTestId('stale-banner')).not.toBeInTheDocument();
});

it('imports dropped .md files anywhere in the window', async () => {
  await renderReadyShell();

  const file = new File(['# Dropped'], 'dropped.md', { type: 'text/markdown' });
  fireEvent.dragEnter(window, {
    dataTransfer: { types: ['Files'], files: [file] },
  });
  expect(screen.getByTestId('drop-overlay')).toBeInTheDocument();

  fireEvent.drop(window, { dataTransfer: { types: ['Files'], files: [file] } });
  expect(screen.queryByTestId('drop-overlay')).not.toBeInTheDocument();
  await waitFor(() => {
    expect(useDocumentStore.getState().name).toBe('dropped');
    expect(useDocumentStore.getState().markdown).toBe('# Dropped');
  });
});

it('collapses and restores the editor pane', async () => {
  await renderReadyShell();

  await userEvent.click(
    screen.getByRole('button', { name: 'Collapse editor pane' }),
  );
  expect(
    screen.queryByRole('complementary', { name: 'Editor pane' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Collapse editor pane' }),
  ).not.toBeInTheDocument();

  await userEvent.click(
    screen.getByRole('button', { name: 'Show editor pane' }),
  );
  expect(
    screen.getByRole('complementary', { name: 'Editor pane' }),
  ).toBeInTheDocument();
});

it('derives fullscreen canvas mode from two collapsed panes', async () => {
  const { container } = await renderReadyShell();

  expect(container.querySelector('[data-fullscreen]')).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Collapse editor pane' }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Collapse inspector pane' }),
  );
  expect(container.querySelector('[data-fullscreen]')).toBeInTheDocument();
  expect(
    screen.getByRole('main', { name: 'Paper Canvas' }),
  ).toBeInTheDocument();
});

it('toggles the theme and persists the choice', async () => {
  await renderReadyShell();

  const toggle = screen.getByRole('button', { name: 'Switch to dark theme' });
  await userEvent.click(toggle);
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
  expect(
    screen.getByRole('button', { name: 'Switch to light theme' }),
  ).toBeInTheDocument();
});

it('resizes the editor pane by dragging the divider', async () => {
  await renderReadyShell();
  stubLayoutWidths();

  const divider = screen.getByRole('separator', { name: 'Resize editor pane' });
  // Start dragging at x=100 with the editor at 456px; +100px → 556px.
  fireEvent.pointerDown(divider, { pointerId: 1, button: 0, clientX: 100 });
  fireEvent.pointerMove(divider, { pointerId: 1, clientX: 200 });
  fireEvent.pointerUp(divider, { pointerId: 1 });

  const editor = screen.getByRole('complementary', { name: 'Editor pane' });
  expect(editor.style.width).toBe('556px');
});

it('clamps drags to the editor min and max widths', async () => {
  await renderReadyShell();
  stubLayoutWidths();

  const divider = screen.getByRole('separator', { name: 'Resize editor pane' });
  fireEvent.pointerDown(divider, { pointerId: 1, button: 0, clientX: 100 });
  // 456 - 1176 → min 280.
  fireEvent.pointerMove(divider, { pointerId: 1, clientX: -1076 });
  fireEvent.pointerUp(divider, { pointerId: 1 });
  expect(
    screen.getByRole('complementary', { name: 'Editor pane' }).style.width,
  ).toBe('280px');

  // 456 + 4900 → max = 1200 - 320 canvas - 320 inspector = 560.
  fireEvent.pointerDown(divider, { pointerId: 1, button: 0, clientX: 0 });
  fireEvent.pointerMove(divider, { pointerId: 1, clientX: 4900 });
  fireEvent.pointerUp(divider, { pointerId: 1 });
  expect(
    screen.getByRole('complementary', { name: 'Editor pane' }).style.width,
  ).toBe('560px');
});

it('resets the editor width to the default ratio on divider double-click', async () => {
  await renderReadyShell();
  stubLayoutWidths();

  const divider = screen.getByRole('separator', { name: 'Resize editor pane' });
  fireEvent.pointerDown(divider, { pointerId: 1, button: 0, clientX: 100 });
  fireEvent.pointerMove(divider, { pointerId: 1, clientX: 200 });
  fireEvent.pointerUp(divider, { pointerId: 1 });
  fireEvent.doubleClick(divider);

  const editor = screen.getByRole('complementary', { name: 'Editor pane' });
  expect(editor.style.width).toBe('38%');
});
