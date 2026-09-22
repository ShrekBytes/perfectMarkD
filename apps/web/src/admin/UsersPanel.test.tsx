// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UsersPanel } from './UsersPanel';
import type { AdminUser, AdminUserDetail } from './api';

function adminUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 42,
    email: 'reader@example.com',
    isAdmin: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    entitlement: { plan: 'pro', expiresAt: '2027-01-05T00:00:00.000Z' },
    usage: { period: '2026-09', used: 12, comps: 0, allowance: 300 },
    aiUsage: { period: '2026-09', used: 4, allowance: 100, remaining: 96 },
    ...overrides,
  };
}

function adminUserDetail(
  overrides: Partial<AdminUserDetail> = {},
): AdminUserDetail {
  return {
    ...adminUser(),
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
        status: 'verified',
        txid: 'a'.repeat(64),
        amountClaimed: '9',
        note: null,
        rejectReason: null,
        createdAt: '2026-08-31T00:00:00.000Z',
        decidedAt: '2026-09-01T00:00:00.000Z',
        walletAddress: 'TTronWalletForTheTest',
        userEmail: 'reader@example.com',
        entitlement: { plan: 'pro', expiresAt: '2027-01-05T00:00:00.000Z' },
      },
    ],
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
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

it('lists users with plan, expiry, and usage', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        jsonResponse(200, {
          users: [
            adminUser(),
            adminUser({
              id: 43,
              email: 'new@example.com',
              entitlement: null,
              usage: { period: '2026-09', used: 0, comps: 0, allowance: 0 },
            }),
          ],
        }),
      ),
    ),
  );

  render(<UsersPanel />);

  const rows = await screen.findAllByTestId('user-row');
  expect(rows).toHaveLength(2);
  expect(screen.getByText(/Pro until 2027-01-05/)).toBeInTheDocument();
  expect(screen.getByText(/12\/300 exports/)).toBeInTheDocument();
  expect(screen.getByText(/Free/)).toBeInTheDocument();
});

it('searches by email on submit', async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/admin/users') {
      return Promise.resolve(jsonResponse(200, { users: [adminUser()] }));
    }
    expect(url).toBe('/api/admin/users?query=reader%40example.com');
    return Promise.resolve(jsonResponse(200, { users: [adminUser()] }));
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<UsersPanel />);
  await screen.findAllByTestId('user-row');
  fetchMock.mockClear();

  await user.type(screen.getByTestId('user-search'), 'reader@example.com');
  await user.click(screen.getByTestId('user-search-submit'));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
});

it('shows an empty state when no user matches', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(jsonResponse(200, { users: [] }))),
  );

  render(<UsersPanel />);

  expect(await screen.findByTestId('users-empty')).toBeInTheDocument();
});

it('opens the detail view from a row and goes back', async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/admin/users/42') {
      return Promise.resolve(jsonResponse(200, { user: adminUserDetail() }));
    }
    return Promise.resolve(jsonResponse(200, { users: [adminUser()] }));
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<UsersPanel />);

  await user.click((await screen.findAllByTestId('user-row'))[0]!);

  // Detail: entitlement, usage, and the Order history.
  expect(await screen.findByTestId('user-entitlement')).toHaveTextContent(
    'Pro until 2027-01-05',
  );
  expect(screen.getByTestId('user-usage')).toHaveTextContent(
    '12 of 300 used (2026-09)',
  );
  expect(screen.getAllByTestId('user-order-row')).toHaveLength(1);
  expect(screen.getByText('PM-7F3K2')).toBeInTheDocument();

  await user.click(screen.getByTestId('user-back'));
  expect(await screen.findAllByTestId('user-row')).toHaveLength(1);
});

it('shows a user with no orders and no entitlement as workable', async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/admin/users/42') {
        return Promise.resolve(
          jsonResponse(200, {
            user: adminUserDetail({
              entitlement: null,
              orders: [],
            }),
          }),
        );
      }
      return Promise.resolve(jsonResponse(200, { users: [adminUser()] }));
    }),
  );

  render(<UsersPanel />);
  await user.click((await screen.findAllByTestId('user-row'))[0]!);

  expect(await screen.findByTestId('user-entitlement')).toHaveTextContent(
    'No active entitlement.',
  );
  expect(screen.getByTestId('user-orders-empty')).toBeInTheDocument();
  expect(screen.getByTestId('user-grant')).toHaveTextContent(
    'Grant entitlement',
  );
  expect(screen.queryByTestId('user-revoke')).not.toBeInTheDocument();
});
