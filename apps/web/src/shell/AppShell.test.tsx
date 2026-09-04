// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import { STORAGE_KEY } from '../theme/theme';
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

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  stubSystemTheme('light');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('renders the top bar contract: wordmark, doc name, Library, theme toggle, Export', () => {
  render(<AppShell />);

  // The wordmark is styled across nested spans, so match its full text content.
  expect(screen.getByRole('banner')).toHaveTextContent('PerfectMarkD');
  expect(screen.getByText('Mark')).toHaveClass('text-accent');
  expect(screen.getByRole('textbox', { name: 'Document name' })).toHaveValue(
    'Untitled document',
  );
  expect(screen.getByRole('button', { name: 'Library' })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Switch to dark theme' }),
  ).toBeInTheDocument();
  expect(screen.getByTestId('export-split')).toBeInTheDocument();
});

it('renders the three panes with their empty states', () => {
  render(<AppShell />);

  expect(screen.getByRole('complementary', { name: 'Editor pane' })).toBeInTheDocument();
  expect(screen.getByRole('main', { name: 'Paper Canvas' })).toBeInTheDocument();
  expect(screen.getByRole('complementary', { name: 'Inspector pane' })).toBeInTheDocument();
  expect(screen.getByText('Start writing — your markdown goes here.')).toBeInTheDocument();
  expect(screen.getByText('Your pages will appear here as you write.')).toBeInTheDocument();
  expect(screen.getByText('Page, style, and header/footer settings live here.')).toBeInTheDocument();
});

it('collapses and restores the editor pane', async () => {
  render(<AppShell />);

  await userEvent.click(screen.getByRole('button', { name: 'Collapse editor pane' }));
  expect(screen.queryByRole('complementary', { name: 'Editor pane' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Collapse editor pane' })).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Show editor pane' }));
  expect(screen.getByRole('complementary', { name: 'Editor pane' })).toBeInTheDocument();
});

it('derives fullscreen canvas mode from two collapsed panes', async () => {
  const { container } = render(<AppShell />);

  expect(container.querySelector('[data-fullscreen]')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Collapse editor pane' }));
  await userEvent.click(screen.getByRole('button', { name: 'Collapse inspector pane' }));
  expect(container.querySelector('[data-fullscreen]')).toBeInTheDocument();
  expect(screen.getByRole('main', { name: 'Paper Canvas' })).toBeInTheDocument();
});

it('toggles the theme and persists the choice', async () => {
  render(<AppShell />);

  const toggle = screen.getByRole('button', { name: 'Switch to dark theme' });
  await userEvent.click(toggle);
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
  expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument();
});

it('resizes the editor pane by dragging the divider', () => {
  render(<AppShell />);
  stubLayoutWidths();

  const divider = screen.getByRole('separator', { name: 'Resize editor pane' });
  // Start dragging at x=100 with the editor at 456px; +100px → 556px.
  fireEvent.pointerDown(divider, { pointerId: 1, button: 0, clientX: 100 });
  fireEvent.pointerMove(divider, { pointerId: 1, clientX: 200 });
  fireEvent.pointerUp(divider, { pointerId: 1 });

  const editor = screen.getByRole('complementary', { name: 'Editor pane' });
  expect(editor.style.width).toBe('556px');
});

it('clamps drags to the editor min and max widths', () => {
  render(<AppShell />);
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

it('resets the editor width to the default ratio on divider double-click', () => {
  render(<AppShell />);
  stubLayoutWidths();

  const divider = screen.getByRole('separator', { name: 'Resize editor pane' });
  fireEvent.pointerDown(divider, { pointerId: 1, button: 0, clientX: 100 });
  fireEvent.pointerMove(divider, { pointerId: 1, clientX: 200 });
  fireEvent.pointerUp(divider, { pointerId: 1 });
  fireEvent.doubleClick(divider);

  const editor = screen.getByRole('complementary', { name: 'Editor pane' });
  expect(editor.style.width).toBe('38%');
});
