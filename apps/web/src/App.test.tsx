// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { resetDocumentStoreForTests } from './documents/store';
import { stubBroadcastChannel } from './testing/stub-broadcast-channel';
import { stubClientRects } from './testing/stub-client-rects';
import { stubIndexedDB } from './testing/stub-idb';
import { stubSystemTheme } from './testing/match-media';

// The editor surface pulls the real sample document (mermaid fence) — keep the
// heavy DOM-timing bundle out of component tests, as in AppShell.test.tsx.
vi.mock('./canvas/mermaid', async () => {
  const { stubMermaidModule } = await import('./testing/stub-mermaid');
  return stubMermaidModule;
});

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  stubSystemTheme('light');
  stubIndexedDB();
  stubBroadcastChannel().reset();
  stubClientRects();
  resetDocumentStoreForTests();
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('renders the editor shell at /', async () => {
  render(<App />);

  // The save indicator only appears once the store is ready and a document
  // is active (first run seeds the sample).
  await screen.findByTestId('save-state', {}, { timeout: 5000 });
  expect(
    screen.queryByRole('heading', { name: 'Simple pricing' }),
  ).not.toBeInTheDocument();
});

it('renders the pricing page at /pricing, then swaps to the editor on the wordmark', async () => {
  const user = userEvent.setup();
  window.history.pushState({}, '', '/pricing');
  render(<App />);

  expect(
    screen.getByRole('heading', { name: 'Simple pricing' }),
  ).toBeInTheDocument();
  expect(screen.queryByTestId('export-split')).not.toBeInTheDocument();

  // Deep link back out: the wordmark is a Link, so the swap is a history push.
  await user.click(screen.getByRole('link', { name: 'PerfectMarkD home' }));
  expect(window.location.pathname).toBe('/');
  await screen.findByTestId('save-state', {}, { timeout: 5000 });
});

it.each([
  ['/login', 'Sign in'],
  ['/register', 'Create account'],
])('renders the auth form at %s', (path, heading) => {
  window.history.pushState({}, '', path);
  render(<App />);

  expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
  // The editor must not mount behind the form.
  expect(screen.queryByTestId('export-split')).not.toBeInTheDocument();
});
