// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AdminPage } from './AdminPage';
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

/** Minimal settings payload the Settings tab renders from. */
const SEED_SETTINGS = {
  wallets: { 'USDT-TRC20': '', 'USDT-BEP20': '', LTC: '' },
  prices: {
    pro: { monthly: 3, durations: { 1: 3, 3: 9, 6: 18, 12: 30 } },
    premium: { monthly: 7, durations: { 1: 7, 3: 21, 6: 42, 12: 70 } },
  },
  limits: {
    pro: { pageCap: 300, quotaMonthly: 300, aiActionsMonthly: 100 },
    premium: { pageCap: 1000, quotaMonthly: 1000, aiActionsMonthly: 300 },
  },
  ltcRateUsdt: null,
  aiProvider: {
    enabled: true,
    baseUrl: 'https://openrouter.ai/api/v1',
    model: '',
    stylesheetModel: null,
    reasoningEffort: 'medium',
    contextWindow: 128000,
    maxOutputTokens: 16000,
    maxInputCharacters: 60000,
    timeoutSeconds: 60,
    burstPerMinute: 10,
  },
  aiKeyPresent: false,
};

beforeEach(() => {
  stubSystemTheme('light');
  resetAccountStoreForTests();
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

it('asks a signed-out visitor to sign in first', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(jsonResponse(401, { error: 'No session.' }))),
  );

  render(<AdminPage />);

  const link = await screen.findByTestId('admin-signin');
  expect(link).toHaveAttribute('href', '/login');
});

it('tells a signed-in non-admin they are in the wrong place', async () => {
  useAccountStore.setState({
    user: { email: 'reader@example.com', isAdmin: false },
    status: 'ready',
  });

  render(<AdminPage />);

  expect(await screen.findByTestId('admin-forbidden')).toBeInTheDocument();
});

it('shows the Verification queue to the admin, with the audit log a tab away', async () => {
  const user = userEvent.setup();
  useAccountStore.setState({
    user: { email: 'owner@example.com', isAdmin: true },
    status: 'ready',
  });
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/admin/orders') {
      return Promise.resolve(
        jsonResponse(200, {
          orders: [
            {
              id: 7,
              referenceCode: 'PM-7F3K2',
              plan: 'pro',
              durationMonths: 3,
              coin: 'USDT',
              network: 'TRC20',
              amountExpected: '9',
              ltcRateUsdt: null,
              status: 'pending',
              txid: null,
              amountClaimed: null,
              note: null,
              rejectReason: null,
              createdAt: '2026-09-10T00:00:00.000Z',
              decidedAt: null,
              walletAddress: 'W',
              userEmail: 'reader@example.com',
              entitlement: null,
            },
          ],
        }),
      );
    }
    if (url === '/api/admin/audit') {
      return Promise.resolve(jsonResponse(200, { entries: [] }));
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<AdminPage />);

  expect(await screen.findByTestId('admin-order-row')).toBeInTheDocument();
  expect(screen.getByTestId('admin-tab-verification')).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await user.click(screen.getByTestId('admin-tab-audit'));

  expect(await screen.findByTestId('audit-empty')).toBeInTheDocument();
  expect(screen.queryByTestId('admin-order-row')).not.toBeInTheDocument();
});

it('gives the admin Users and Settings tabs (billing/03)', async () => {
  const user = userEvent.setup();
  useAccountStore.setState({
    user: { email: 'owner@example.com', isAdmin: true },
    status: 'ready',
  });
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/admin/orders') {
      return Promise.resolve(jsonResponse(200, { orders: [] }));
    }
    if (url === '/api/admin/users') {
      return Promise.resolve(jsonResponse(200, { users: [] }));
    }
    if (url === '/api/admin/settings') {
      return Promise.resolve(jsonResponse(200, { settings: SEED_SETTINGS }));
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<AdminPage />);

  // Users tab: the empty search list.
  await user.click(screen.getByTestId('admin-tab-users'));
  expect(await screen.findByTestId('users-empty')).toBeInTheDocument();

  // Settings tab: the wallet section.
  await user.click(screen.getByTestId('admin-tab-settings'));
  expect(
    await screen.findByTestId('wallet-input-USDT-TRC20'),
  ).toBeInTheDocument();
});
