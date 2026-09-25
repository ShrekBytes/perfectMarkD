// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import { resetDocumentStoreForTests } from '../documents/store';
import { stubBroadcastChannel } from '../testing/stub-broadcast-channel';
import { stubClientRects } from '../testing/stub-client-rects';
import { stubIndexedDB } from '../testing/stub-idb';
import { stubSystemTheme } from '../testing/match-media';

// The sample carries a mermaid fence; component tests must not pull the real
// bundle (see AppShell.test.tsx — the hook itself is covered separately).
vi.mock('../canvas/mermaid', async () => {
  const { stubMermaidModule } = await import('../testing/stub-mermaid');
  return stubMermaidModule;
});

/**
 * jsdom performs no layout, so the shell's container width reads 0 and
 * usePaneLayout keeps the wide layout. Pin it to a phone width instead, so the
 * compact single-pane mode is what renders.
 *
 * jsdom also applies no stylesheets, so Tailwind's `hidden` has no effect on
 * computed styles. The pane assertions below therefore check the class the
 * shell chose; the rendered result — no horizontal overflow, one pane on
 * screen — is what e2e/shell-compact.spec.ts asserts in real Chromium.
 */
function stubPhoneWidth() {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(420);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(420);
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  stubSystemTheme('light');
  stubIndexedDB();
  stubBroadcastChannel().reset();
  stubClientRects();
  resetDocumentStoreForTests();
  stubPhoneWidth();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderCompactShell() {
  const result = render(<AppShell />);
  // The autosave readout doubles as the ready gate (same as AppShell.test).
  await screen.findByTestId('save-state', {}, { timeout: 5000 });
  return result;
}

const editor = () => screen.getByRole('complementary', { name: 'Editor pane' });
const canvas = () => screen.getByRole('main', { name: 'Paper Canvas' });
const inspector = () =>
  screen.getByRole('complementary', { name: 'Inspector pane' });

it('shows one pane at a time behind the switcher, with the desktop dividers gone', async () => {
  const { container } = await renderCompactShell();

  expect(
    container.querySelector('[data-testid="shell-content"]'),
  ).toHaveAttribute('data-layout', 'compact');
  expect(screen.getByTestId('compact-bar')).toBeInTheDocument();

  // Resizing and hover-revealed collapse chevrons are wide-layout powers; in
  // compact they are replaced by the switcher.
  expect(
    screen.queryByRole('separator', { name: 'Resize editor pane' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Collapse editor pane' }),
  ).not.toBeInTheDocument();
  expect(container.querySelector('[data-fullscreen]')).not.toBeInTheDocument();

  expect(editor()).toHaveClass('flex');
  expect(canvas()).toHaveClass('hidden');
  expect(inspector()).toHaveClass('hidden');
});

it('switches the visible pane by name', async () => {
  await renderCompactShell();

  await userEvent.click(screen.getByRole('button', { name: 'Paper' }));
  expect(screen.getByRole('button', { name: 'Paper' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(canvas()).toHaveClass('flex');
  expect(editor()).toHaveClass('hidden');

  await userEvent.click(screen.getByRole('button', { name: 'Inspector' }));
  expect(inspector()).toHaveClass('flex');
  expect(canvas()).toHaveClass('hidden');
  // The Inspector is live, not a placeholder.
  expect(screen.getByRole('tab', { name: 'Page' })).toBeInTheDocument();
});

it('keeps every pane mounted, so switching views never restarts the preview', async () => {
  await renderCompactShell();

  // The editor is the visible pane, yet the canvas is mounted and rendering —
  // its page count feeds the Library rows and the document record.
  expect(editor()).toHaveClass('flex');
  expect(screen.getByTestId('canvas-scroll')).toBeInTheDocument();
  expect(screen.getByTestId('editor-stats')).toBeInTheDocument();
});

it('keeps the primary Export action in the bar and folds the rest into the menu', async () => {
  await renderCompactShell();

  expect(screen.getByTestId('export-split')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'More options' }),
  ).toBeInTheDocument();

  // The desktop-only cluster is gone; Library, theme, and account live in the
  // overflow menu (the Export menu still carries the Server Export quota).
  expect(
    screen.queryByRole('button', { name: 'Library' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Switch to dark theme' }),
  ).not.toBeInTheDocument();
  // The proof gauge is wide-layout chrome: compact spends its bar on the
  // document name and the primary action instead.
  expect(screen.queryByTestId('proof-gauge')).not.toBeInTheDocument();
});

it('reaches the Library through the overflow menu', async () => {
  await renderCompactShell();

  await userEvent.click(screen.getByRole('button', { name: 'More options' }));
  await userEvent.click(screen.getByRole('menuitem', { name: /Library/ }));

  expect(screen.getByRole('dialog', { name: 'Library' })).toBeInTheDocument();
});

it('keeps the notice strips on screen whatever pane is showing', async () => {
  await renderCompactShell();

  expect(screen.getByTestId('welcome-strip')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Paper' }));
  expect(screen.getByTestId('welcome-strip')).toBeInTheDocument();
});
