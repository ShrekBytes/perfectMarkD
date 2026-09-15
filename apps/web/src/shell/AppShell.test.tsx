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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import { STORAGE_KEY } from '../theme/theme';
import {
  resetDocumentStoreForTests,
  useDocumentStore,
} from '../documents/store';
import { useAccountStore } from '../auth/account-store';
import { stubBroadcastChannel } from '../testing/stub-broadcast-channel';
import { stubClientRects } from '../testing/stub-client-rects';
import { stubIndexedDB } from '../testing/stub-idb';
import { stubSystemTheme } from '../testing/match-media';

// The sample document carries a mermaid fence; component tests must not pull
// the real (multi-MB, DOM-timing) bundle. The hook itself is covered in
// canvas/mermaid.test.ts.
vi.mock('../canvas/mermaid', async () => {
  const { stubMermaidModule } = await import('../testing/stub-mermaid');
  return stubMermaidModule;
});

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
  stubClientRects();
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
  // so its appearance doubles as the "ready" gate. The generous timeout
  // absorbs first-run seeding plus CPU contention from the parallel suite.
  await screen.findByTestId('save-state', {}, { timeout: 5000 });
  return result;
}

it('renders the top bar contract: wordmark, doc name, save state, Library, theme toggle, Export', async () => {
  await renderReadyShell();

  // The wordmark is styled across nested spans, so match its full text content.
  expect(screen.getByRole('banner')).toHaveTextContent('PerfectMarkD');
  expect(screen.getByText('Mark')).toHaveClass('font-mono');
  // First run opens the seeded sample document. DocName's draft syncs via
  // effect after the store lands, so the value settles rather than being
  // read mid-seed (a rare-but-real flake under suite parallelism).
  await waitFor(() => {
    expect(screen.getByRole('textbox', { name: 'Document name' })).toHaveValue(
      'Welcome to PerfectMarkD',
    );
  });
  expect(screen.getByTestId('save-state')).toHaveTextContent('Saved');
  expect(screen.getByRole('button', { name: 'Library' })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Switch to dark theme' }),
  ).toBeInTheDocument();
  expect(screen.getByTestId('export-split')).toBeInTheDocument();
});

it('renders the three panes with the sample experience on first run', async () => {
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
  // The Paper Canvas mounts live: the pages area is present, shimmering
  // until the first render lands (PaperCanvas.test.tsx covers the render).
  expect(screen.getByTestId('canvas-loading')).toBeInTheDocument();
  // The welcome strip mounts at shell level with the other notices.
  expect(screen.getByTestId('welcome-strip')).toBeInTheDocument();
  expect(
    screen.getByText('This is a sample — edit it, or start a blank document.'),
  ).toBeInTheDocument();
  // The Inspector is live (editor-app/05): tabs render, not a placeholder.
  expect(screen.getByRole('tab', { name: 'Page' })).toBeInTheDocument();
  expect(
    screen.getByRole('tabpanel', { name: 'Page settings' }),
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

it('exposes aria-valuemax on the pane separators, live with layout', async () => {
  // Widths must be stubbed before render: the max is computed at render
  // time (jsdom has no layout and no ResizeObserver).
  stubLayoutWidths();
  await renderReadyShell();

  const editorDivider = screen.getByRole('separator', {
    name: 'Resize editor pane',
  });
  const inspectorDivider = screen.getByRole('separator', {
    name: 'Resize inspector pane',
  });

  // jsdom stubs the container at 1200px. The ceiling is the coupled resize
  // negotiation's: the canvas keeps its 320px minimum and the neighbor pane
  // yields down to its own, so editor max = 1200 - 320 - 260 (inspector min)
  // and inspector max = 1200 - 320 - 280 (editor min).
  expect(editorDivider).toHaveAttribute(
    'aria-valuemax',
    String(1200 - 320 - 260),
  );
  expect(editorDivider).toHaveAttribute('aria-valuemin', '280');
  expect(
    Number(editorDivider.getAttribute('aria-valuemax')),
  ).toBeGreaterThanOrEqual(Number(editorDivider.getAttribute('aria-valuemin')));
  expect(
    Number(inspectorDivider.getAttribute('aria-valuemax')),
  ).toBeGreaterThan(0);
  expect(inspectorDivider).toHaveAttribute('aria-valuemin', '260');

  // Collapsing the inspector frees its width: the editor's max ceiling grows.
  await userEvent.click(
    screen.getByRole('button', { name: 'Collapse inspector pane' }),
  );
  await waitFor(() => {
    expect(editorDivider.getAttribute('aria-valuemax')).toBe(
      String(1200 - 320),
    );
  });
});

it('shows the canvas empty state with a New document action when no documents exist', async () => {
  await renderReadyShell();

  expect(
    screen.queryByRole('dialog', { name: 'Library' }),
  ).not.toBeInTheDocument();
  await act(async () => {
    const { activeId } = useDocumentStore.getState();
    if (activeId) await useDocumentStore.getState().deleteDocument(activeId);
  });
  await waitFor(() => {
    expect(useDocumentStore.getState().docs).toHaveLength(0);
  });
  // The desk stays visible: no drawer auto-opens over it — this is the
  // regression guard; the button below alone would not catch it.
  expect(
    screen.queryByRole('dialog', { name: 'Library' }),
  ).not.toBeInTheDocument();
  // The empty canvas offers the single primary recovery action instead.
  const newDoc = await screen.findByTestId('empty-canvas-new-doc');
  expect(
    screen.getByText('Create a document to see its pages here.'),
  ).toBeInTheDocument();
  await userEvent.click(newDoc);
  await waitFor(() => {
    expect(useDocumentStore.getState().docs).toHaveLength(1);
  });
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
    pageCount: null,
  };
}

it('shows the staleness banner when another tab changed the active document', async () => {
  await renderReadyShell();

  act(() => {
    useDocumentStore.setState({ remotePending: makeRemotePending() });
  });
  expect(screen.getByTestId('stale-banner')).toHaveTextContent(
    'This document changed in another tab',
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

it('stacks the notice strips under the top bar in urgency order', async () => {
  await renderReadyShell();

  act(() => {
    useDocumentStore.setState({ remotePending: makeRemotePending() });
    useAccountStore.setState({ planEndedNotice: true });
  });

  const [stale, plan, welcome] = [
    'stale-banner',
    'plan-ended-banner',
    'welcome-strip',
  ].map((testid) => screen.getByTestId(testid)) as [
    HTMLElement,
    HTMLElement,
    HTMLElement,
  ];
  // Conflict and plan notices first, welcome last: DOM order is visual order.
  expect(
    stale.compareDocumentPosition(plan) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    plan.compareDocumentPosition(welcome) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it('keeps the welcome strip visible with the editor pane collapsed', async () => {
  await renderReadyShell();

  await userEvent.click(
    screen.getByRole('button', { name: 'Collapse editor pane' }),
  );
  expect(
    screen.queryByRole('complementary', { name: 'Editor pane' }),
  ).not.toBeInTheDocument();
  // Shell-level chrome: a collapsed pane can never hide a notice.
  expect(screen.getByTestId('welcome-strip')).toBeInTheDocument();
});

describe('proofing gauge', () => {
  it('reads the canvas-reported count and updates live on edit', async () => {
    await renderReadyShell();

    // Before the canvas has reported, the paper size alone — never a
    // fabricated count.
    expect(screen.getByTestId('proof-gauge').textContent).toMatch(
      /^A4( · \d+ pages)?$/,
    );

    const file = new File(
      ['one\n\n///\n\ntwo\n\n///\n\nthree'],
      'three-pages.md',
      { type: 'text/markdown' },
    );
    fireEvent.dragEnter(window, {
      dataTransfer: { types: ['Files'], files: [file] },
    });
    fireEvent.drop(window, {
      dataTransfer: { types: ['Files'], files: [file] },
    });

    await waitFor(
      () => {
        expect(screen.getByTestId('proof-gauge')).toHaveTextContent(
          'A4 · 3 pages',
        );
      },
      { timeout: 10_000 },
    );
  });

  it('disappears when no document is active', async () => {
    await renderReadyShell();

    await act(async () => {
      const { activeId } = useDocumentStore.getState();
      if (activeId) await useDocumentStore.getState().deleteDocument(activeId);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('proof-gauge')).not.toBeInTheDocument();
    });
  });
});

it('shows Library rows with a thumbnail sketch and a counted meta line', async () => {
  await renderReadyShell();

  // The count exists once the Paper Canvas has rendered the document.
  await waitFor(
    () => {
      expect(useDocumentStore.getState().pageCount).not.toBeNull();
    },
    { timeout: 10_000 },
  );
  await userEvent.click(screen.getByRole('button', { name: 'Library' }));

  const row = screen.getByTestId('row-meta').closest('li')!;
  // The leading miniature sheet, sketched from the document's own page —
  // its geometry is the footprint's own unit test (library/thumb.test.ts).
  expect(row.querySelector('div[aria-hidden="true"]')).toBeInTheDocument();
  expect(screen.getByTestId('row-meta')).toHaveTextContent(/· \d+ pages?$/);
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

it('rejects a non-.md drop with a toast naming the problem and recovery', async () => {
  await renderReadyShell();
  const before = useDocumentStore.getState().docs.length;

  const file = new File(['%PDF'], 'resume.pdf', { type: 'application/pdf' });
  fireEvent.dragEnter(window, {
    dataTransfer: { types: ['Files'], files: [file] },
  });
  fireEvent.drop(window, { dataTransfer: { types: ['Files'], files: [file] } });

  // The drop never disappears into a filter: the toast names the file, the
  // rule, and the way out — and nothing was imported.
  const toast = screen.getByTestId('drop-rejected-toast');
  expect(toast).toHaveTextContent('Only .md files can be imported');
  expect(toast).toHaveTextContent('resume.pdf');
  expect(toast).toHaveTextContent('paste its text into the editor');
  expect(useDocumentStore.getState().docs.length).toBe(before);

  await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByTestId('drop-rejected-toast')).not.toBeInTheDocument();
});

it('imports the Markdown of a mixed drop and reports the rest', async () => {
  await renderReadyShell();

  const md = new File(['# Mixed'], 'mixed.md', { type: 'text/markdown' });
  const pdf = new File(['%PDF'], 'poster.pdf', { type: 'application/pdf' });
  fireEvent.dragEnter(window, {
    dataTransfer: { types: ['Files'], files: [md, pdf] },
  });
  fireEvent.drop(window, {
    dataTransfer: { types: ['Files'], files: [md, pdf] },
  });

  await waitFor(() => {
    expect(useDocumentStore.getState().name).toBe('mixed');
  });
  expect(screen.getByTestId('drop-rejected-toast')).toHaveTextContent(
    'poster.pdf',
  );
});

it('edits settings in the Inspector and re-renders the canvas pages', async () => {
  await renderReadyShell();

  // Inspector edits flow through updateActive; the canvas re-renders on the
  // settings reference change (PaperCanvas.test.tsx covers the render loop,
  // this pins the shell-level wiring).
  const top = screen.getByRole('spinbutton', { name: 'Top margin' });
  await userEvent.clear(top);
  await userEvent.type(top, '30');
  await act(async () => {
    await useDocumentStore.getState().flush();
  });

  expect(useDocumentStore.getState().settings.marginTop).toBe(30);
  // The pages area still hosts a page for the seeded sample document.
  await waitFor(() => {
    expect(document.querySelector('.pm-page-host')).toBeInTheDocument();
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

  // 456 + 4900 → max = 1200 - 320 canvas - 260 inspector floor = 620, and the
  // coupled write yields the inspector down to its 260px floor so the state
  // matches what the layout renders.
  fireEvent.pointerDown(divider, { pointerId: 1, button: 0, clientX: 0 });
  fireEvent.pointerMove(divider, { pointerId: 1, clientX: 4900 });
  fireEvent.pointerUp(divider, { pointerId: 1 });
  expect(
    screen.getByRole('complementary', { name: 'Editor pane' }).style.width,
  ).toBe('620px');
  expect(
    screen.getByRole('complementary', { name: 'Inspector pane' }).style.width,
  ).toBe('260px');
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
