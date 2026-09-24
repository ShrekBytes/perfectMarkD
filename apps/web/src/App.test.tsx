// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { resetDocumentStoreForTests } from './documents/store';
import {
  resetAccountStoreForTests,
  useAccountStore,
} from './auth/account-store';
import { stubBroadcastChannel } from './testing/stub-broadcast-channel';
import { stubClientRects } from './testing/stub-client-rects';
import { stubIndexedDB } from './testing/stub-idb';
import { stubSystemTheme } from './testing/match-media';
import { jsonResponse } from './testing/json-response';
import { initAnalytics, trackPageView } from './analytics/tracker';

// The editor surface pulls the real sample document (mermaid fence) — keep the
// heavy DOM-timing bundle out of component tests, as in AppShell.test.tsx.
vi.mock('./canvas/mermaid', async () => {
  const { stubMermaidModule } = await import('./testing/stub-mermaid');
  return stubMermaidModule;
});

// Analytics is asserted as "the app asked for this", not as "Umami received
// it" — the wrapper's own suite covers delivery.
vi.mock('./analytics/tracker', () => ({
  initAnalytics: vi.fn(),
  trackPageView: vi.fn(),
  trackEvent: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  stubSystemTheme('light');
  stubIndexedDB();
  stubBroadcastChannel().reset();
  stubClientRects();
  resetDocumentStoreForTests();
  resetAccountStoreForTests();
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

it('renders the docs page at /docs', async () => {
  window.history.pushState({}, '', '/docs');
  render(<App />);

  expect(
    screen.getByRole('heading', { name: 'Docs', level: 1 }),
  ).toBeInTheDocument();

  // The section nav generates from the rendered headings once the single
  // markdown source has come through the engine's renderer.
  expect(
    await screen.findByRole('link', { name: 'Getting started' }),
  ).toBeInTheDocument();
  const nav = screen.getByRole('navigation', { name: 'Sections' });
  expect(nav.querySelectorAll('a').length).toBeGreaterThan(3);

  // The editor must not mount behind the page.
  expect(screen.queryByTestId('export-split')).not.toBeInTheDocument();
});

it('renders the account page at /account', async () => {
  window.history.pushState({}, '', '/account');
  useAccountStore.setState({
    user: { email: 'reader@example.com', isAdmin: false },
    status: 'ready',
    entitlement: { plan: 'pro', expiresAt: '2026-10-15T00:00:00.000Z' },
    quota: { used: 1, limit: 10 },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string | URL | Request) => {
      if (String(url) === '/api/orders') {
        return Promise.resolve(jsonResponse(200, { orders: [] }));
      }
      if (String(url) === '/api/history') {
        return Promise.resolve(jsonResponse(200, { entries: [] }));
      }
      return Promise.reject(new Error('unexpected fetch'));
    }),
  );
  render(<App />);

  expect(
    await screen.findByRole('heading', { name: 'Account' }),
  ).toBeInTheDocument();
  expect(await screen.findByText('Pro')).toBeInTheDocument();
  // The editor must not mount behind the page.
  expect(screen.queryByTestId('export-split')).not.toBeInTheDocument();
});

it('sends one page view per route change', async () => {
  const user = userEvent.setup();
  window.history.pushState({}, '', '/pricing');
  render(<App />);

  expect(initAnalytics).toHaveBeenCalledTimes(1);
  expect(trackPageView).toHaveBeenCalledTimes(1);
  expect(trackPageView).toHaveBeenCalledWith('/pricing');

  // The wordmark is a Link, so the swap is a history push the router sees.
  await user.click(screen.getByRole('link', { name: 'PerfectMarkD home' }));

  expect(trackPageView).toHaveBeenCalledTimes(2);
  expect(trackPageView).toHaveBeenLastCalledWith('/');

  // Let the editor's store settle, as the tests above do — an in-flight
  // IndexedDB transaction would otherwise abort at cleanup.
  await screen.findByTestId('save-state', {}, { timeout: 5000 });
});

it('sends nothing from the hidden /export surface the worker renders', () => {
  window.history.pushState({}, '', '/export');
  render(<App />);

  // One Server Export = one machine render of /export, so counting it as a
  // visit would make the page-view numbers meaningless.
  expect(initAnalytics).not.toHaveBeenCalled();
  expect(trackPageView).not.toHaveBeenCalled();
});
