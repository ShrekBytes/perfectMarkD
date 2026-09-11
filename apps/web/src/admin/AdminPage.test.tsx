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
