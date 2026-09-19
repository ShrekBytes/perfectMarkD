// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AccountPage } from './AccountPage';
import {
  resetAccountStoreForTests,
  useAccountStore,
} from '../auth/account-store';
import { stubSystemTheme } from '../testing/match-media';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  stubSystemTheme('light');
  resetAccountStoreForTests();
  window.history.pushState({}, '', '/account');
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('unexpected fetch'))),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('renders the auth pages’ minimal header — wordmark, theme toggle, no footer', () => {
  useAccountStore.setState({ user: null, status: 'ready' });

  render(<AccountPage />);

  // The wordmark is styled across nested spans, so match its full text content.
  expect(screen.getByRole('banner')).toHaveTextContent('PerfectMarkD');
  expect(
    screen.getByRole('button', { name: 'Switch to dark theme' }),
  ).toBeInTheDocument();
  // An app surface, not a marketing surface: no footer.
  expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
});

it('offers the sign-in prompt when signed out', async () => {
  useAccountStore.setState({ user: null, status: 'ready' });

  render(<AccountPage />);

  expect(screen.getByRole('heading', { name: 'Account' })).toBeInTheDocument();
  expect(
    await screen.findByText(/not signed in/),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    '/login',
  );
  // No account sections render for a signed-out visitor.
  expect(screen.queryByRole('heading', { name: 'Plan' })).not.toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'Orders' }),
  ).not.toBeInTheDocument();
});

it('renders the sections for a signed-in account', async () => {
  useAccountStore.setState({
    user: { email: 'reader@example.com', isAdmin: false },
    status: 'ready',
    entitlement: { plan: 'premium', expiresAt: '2026-10-15T00:00:00.000Z' },
    quota: { used: 2, limit: 40 },
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

  render(<AccountPage />);

  expect(screen.getByRole('heading', { name: 'Account' })).toBeInTheDocument();
  expect(screen.getByText('reader@example.com')).toBeInTheDocument();
  // Plan summary: the store's entitlement and quota, not a second fetch.
  expect(await screen.findByText('Premium')).toBeInTheDocument();
  expect(screen.getByText('Expires 2026-10-15')).toBeInTheDocument();
  expect(screen.getByTestId('account-quota')).toHaveTextContent('2 of 40');
  // Orders, Export history, and the password form compose below.
  expect(screen.getByRole('heading', { name: 'Orders' })).toBeInTheDocument();
  expect(await screen.findByText('No orders yet.')).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Export history' }),
  ).toBeInTheDocument();
  expect(await screen.findByText('No exports yet.')).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Change password' }),
  ).toBeInTheDocument();
});

it('renders nothing but the header until the session check resolves', () => {
  render(<AccountPage />);

  expect(screen.queryByRole('heading', { name: 'Account' })).not.toBeInTheDocument();
  expect(screen.queryByText(/not signed in/)).not.toBeInTheDocument();
});
