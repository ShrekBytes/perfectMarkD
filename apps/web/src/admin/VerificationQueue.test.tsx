// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VerificationQueue } from './VerificationQueue';
import type { AdminOrder } from './api';

const TXID = 'a'.repeat(64);

function adminOrder(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id: 7,
    referenceCode: 'PM-7F3K2',
    plan: 'pro',
    durationMonths: 3,
    coin: 'USDT',
    network: 'TRC20',
    amountExpected: '9',
    ltcRateUsdt: null,
    status: 'pending',
    txid: TXID,
    amountClaimed: '9',
    note: null,
    rejectReason: null,
    createdAt: '2026-09-10T00:00:00.000Z',
    decidedAt: null,
    paymentDeadline: null,
    paymentExpired: false,
    walletAddress: 'TTronWalletForTheTest',
    userEmail: 'reader@example.com',
    entitlement: null,
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

it('lists pending orders with the details the Admin decides on', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(jsonResponse(200, { orders: [adminOrder()] }))),
  );

  render(<VerificationQueue />);

  const row = await screen.findByTestId('admin-order-row');
  expect(row).toHaveTextContent('PM-7F3K2');
  expect(row).toHaveTextContent('reader@example.com');
  expect(row).toHaveTextContent('pro · 3 months');
  expect(row).toHaveTextContent('Claimed 9 · expected 9 USDT');
  const link = screen.getByTestId('txid-link');
  expect(link).toHaveAttribute(
    'href',
    `https://tronscan.org/#/transaction/${TXID}`,
  );
  expect(link).toHaveAttribute('target', '_blank');
});

it('flags a claimed amount that does not match the expected one', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        jsonResponse(200, {
          orders: [adminOrder({ amountClaimed: '3' })],
        }),
      ),
    ),
  );

  render(<VerificationQueue />);

  const row = await screen.findByTestId('admin-order-row');
  expect(screen.getByTestId('amount-mismatch')).toHaveTextContent(
    'Claimed 3 · expected 9 USDT',
  );
  expect(row).toHaveTextContent('Claimed 3 · expected 9 USDT');
});

it('values an LTC order against the rate captured at creation', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        jsonResponse(200, {
          orders: [
            adminOrder({
              coin: 'LTC',
              network: 'mainnet',
              amountExpected: '0.1',
              ltcRateUsdt: '320.5',
              amountClaimed: '0.1',
            }),
          ],
        }),
      ),
    ),
  );

  render(<VerificationQueue />);

  await screen.findByTestId('admin-order-row');
  expect(screen.getByTestId('usdt-equivalent')).toHaveTextContent(
    '≈ 32.05 USDT',
  );
  expect(screen.getByTestId('txid-link')).toHaveAttribute(
    'href',
    `https://blockchair.com/litecoin/transaction/${TXID}`,
  );
});

it('filters the list by status, pending first', async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        jsonResponse(200, {
          orders: [
            adminOrder({ id: 1, referenceCode: 'PM-PEND1' }),
            adminOrder({
              id: 2,
              referenceCode: 'PM-VER1',
              status: 'verified',
              decidedAt: '2026-09-11T00:00:00.000Z',
              paymentDeadline: null,
              paymentExpired: false,
            }),
            adminOrder({
              id: 3,
              referenceCode: 'PM-REJ1',
              status: 'rejected',
              rejectReason: 'Wrong wallet.',
              decidedAt: '2026-09-11T00:00:00.000Z',
              paymentDeadline: null,
              paymentExpired: false,
            }),
          ],
        }),
      ),
    ),
  );

  render(<VerificationQueue />);
  await screen.findByTestId('admin-order-row');

  // Defaults to the pending queue.
  expect(screen.getAllByTestId('admin-order-row')).toHaveLength(1);
  expect(screen.getByText('PM-PEND1')).toBeInTheDocument();

  await user.click(screen.getByTestId('filter-verified'));
  expect(screen.getByText('PM-VER1')).toBeInTheDocument();
  expect(screen.queryByText('PM-PEND1')).not.toBeInTheDocument();

  await user.click(screen.getByTestId('filter-rejected'));
  expect(screen.getByText('PM-REJ1')).toBeInTheDocument();
  expect(screen.getByText('Reason: Wrong wallet.')).toBeInTheDocument();

  await user.click(screen.getByTestId('filter-all'));
  expect(screen.getAllByTestId('admin-order-row')).toHaveLength(3);
});

it('verifies from the queue and refreshes', async () => {
  const user = userEvent.setup();
  const pending = [adminOrder({ id: 1, referenceCode: 'PM-PEND1' })];
  const decided = [
    adminOrder({
      id: 1,
      referenceCode: 'PM-PEND1',
      status: 'verified',
      decidedAt: '2026-09-11T00:00:00.000Z',
      paymentDeadline: null,
      paymentExpired: false,
      entitlement: { plan: 'pro', expiresAt: '2026-10-11T00:00:00.000Z' },
    }),
  ];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/admin/orders' && (!init || !init.method)) {
      return Promise.resolve(
        jsonResponse(200, {
          orders: fetchMock.mock.calls.length === 1 ? pending : decided,
        }),
      );
    }
    if (url === '/api/admin/orders/1/verify') {
      return Promise.resolve(
        jsonResponse(200, {
          order: decided[0],
          entitlement: { plan: 'pro', expiresAt: '2026-10-11T00:00:00.000Z' },
        }),
      );
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<VerificationQueue />);
  await screen.findByTestId('admin-order-row');

  await user.click(screen.getByTestId('verify-button'));
  expect(screen.getByTestId('verify-dialog')).toBeInTheDocument();
  await user.click(screen.getByTestId('duration-1'));
  await user.click(screen.getByTestId('confirm-verify'));

  await waitFor(() =>
    expect(screen.queryByTestId('verify-dialog')).not.toBeInTheDocument(),
  );
  // The default pending filter is now empty; switch to verified to see it.
  await user.click(screen.getByTestId('filter-verified'));
  expect(screen.getByText('PM-PEND1')).toBeInTheDocument();
  expect(screen.getByTestId('admin-order-row')).toHaveTextContent('Verified');
});

it('rejects from the queue with a reason and refreshes', async () => {
  const user = userEvent.setup();
  const pending = [adminOrder({ id: 1, referenceCode: 'PM-PEND1' })];
  const rejected = [
    adminOrder({
      id: 1,
      referenceCode: 'PM-PEND1',
      status: 'rejected',
      rejectReason: 'Wrong amount.',
      decidedAt: '2026-09-11T00:00:00.000Z',
      paymentDeadline: null,
      paymentExpired: false,
    }),
  ];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/admin/orders' && (!init || !init.method)) {
      return Promise.resolve(
        jsonResponse(200, {
          orders: fetchMock.mock.calls.length === 1 ? pending : rejected,
        }),
      );
    }
    if (url === '/api/admin/orders/1/reject') {
      return Promise.resolve(jsonResponse(200, { order: rejected[0] }));
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<VerificationQueue />);
  await screen.findByTestId('admin-order-row');

  await user.click(screen.getByTestId('reject-button'));
  await user.type(screen.getByTestId('reject-reason'), 'Wrong amount.');
  await user.click(screen.getByTestId('confirm-reject'));

  await waitFor(() =>
    expect(screen.queryByTestId('reject-dialog')).not.toBeInTheDocument(),
  );
  await user.click(screen.getByTestId('filter-rejected'));
  expect(screen.getByText('Reason: Wrong amount.')).toBeInTheDocument();
});

it('shows a queue-specific empty state', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(jsonResponse(200, { orders: [] }))),
  );

  render(<VerificationQueue />);

  expect(await screen.findByTestId('queue-empty')).toHaveTextContent(
    'No pending orders',
  );
});

it('shows a retryable error when the queue cannot load', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new TypeError('network down'))),
  );

  render(<VerificationQueue />);

  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByTestId('queue-retry')).toBeInTheDocument();
});

it('will not offer to verify a lapsed Order that has no payment submitted', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        jsonResponse(200, {
          orders: [
            adminOrder({
              txid: null,
              amountClaimed: null,
              paymentDeadline: '2026-09-10T06:00:00.000Z',
              paymentExpired: true,
            }),
          ],
        }),
      ),
    ),
  );

  render(<VerificationQueue />);

  // The pending queue is a work list, and there is no on-chain event to look
  // at: a row nobody can act on is not work, so the default filter leaves it
  // out.
  expect(await screen.findByTestId('queue-empty')).toBeInTheDocument();

  // It is still in All, because the queue is also the financial record.
  const user = userEvent.setup();
  await user.click(screen.getByTestId('filter-all'));
  expect(await screen.findByTestId('order-window-lapsed')).toHaveTextContent(
    'can no longer be paid',
  );
  expect(screen.queryByTestId('verify-button')).not.toBeInTheDocument();
  // Reject stays: the user is owed a reason, and a closed window is one.
  expect(screen.getByTestId('reject-button')).toBeInTheDocument();
});

it('still offers Verify when the payment arrived inside the window', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        jsonResponse(200, {
          orders: [
            adminOrder({
              paymentDeadline: '2026-09-10T06:00:00.000Z',
              paymentExpired: true,
            }),
          ],
        }),
      ),
    ),
  );

  render(<VerificationQueue />);

  // The window bounds when a customer may submit, not what an Admin may read.
  // Withholding Verify from a payment that was made in time would reject
  // someone who paid the figure they were quoted, which is worse than a stale
  // quote ever was.
  expect(await screen.findByTestId('verify-button')).toBeInTheDocument();
  expect(screen.queryByTestId('order-window-lapsed')).not.toBeInTheDocument();
});

it('keeps offering Verify on an Order whose window is still open', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        jsonResponse(200, {
          orders: [
            adminOrder({
              paymentDeadline: '2026-09-10T06:00:00.000Z',
              paymentExpired: false,
            }),
          ],
        }),
      ),
    ),
  );

  render(<VerificationQueue />);

  expect(await screen.findByTestId('verify-button')).toBeInTheDocument();
  expect(screen.queryByTestId('order-window-lapsed')).not.toBeInTheDocument();
});

it('explains a short LTC payment as a rate move when the rate has moved', async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    if (String(input) === '/api/admin/rate') {
      return Promise.resolve(jsonResponse(200, { rate: { usdtPerLtc: 400 } }));
    }
    return Promise.resolve(
      jsonResponse(200, {
        orders: [
          adminOrder({
            coin: 'LTC',
            network: 'mainnet',
            amountExpected: '0.02',
            // 0.02 LTC at 320.5 is 6.41 USDT; the order paid 6.00's worth.
            ltcRateUsdt: '320.5',
            amountClaimed: '0.0187',
          }),
        ],
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<VerificationQueue />);

  // The Admin is deciding on an Entitlement here. Telling them the user
  // miscalculated when the rate moved is sending them after the wrong thing.
  expect(await screen.findByTestId('rate-moved-context')).toHaveTextContent(
    'now 400 USDT per LTC',
  );
  expect(screen.getByTestId('amount-mismatch')).toBeInTheDocument();
});

it('says nothing about the rate when a USDT payment is short', async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    if (String(input) === '/api/admin/rate') {
      return Promise.resolve(jsonResponse(200, { rate: { usdtPerLtc: 400 } }));
    }
    return Promise.resolve(
      jsonResponse(200, {
        orders: [adminOrder({ amountClaimed: '3' })],
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<VerificationQueue />);

  await screen.findByTestId('amount-mismatch');
  // A USDT order has no Rate at all. Nothing moved, and the queue must not
  // invent a reason.
  expect(screen.queryByTestId('rate-moved-context')).not.toBeInTheDocument();
});

it('says nothing about the rate when the claimed amount matches', async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    if (String(input) === '/api/admin/rate') {
      return Promise.resolve(jsonResponse(200, { rate: { usdtPerLtc: 400 } }));
    }
    return Promise.resolve(
      jsonResponse(200, {
        orders: [adminOrder({ coin: 'LTC', ltcRateUsdt: '320.5' })],
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<VerificationQueue />);

  await screen.findByTestId('admin-order-row');
  expect(screen.queryByTestId('rate-moved-context')).not.toBeInTheDocument();
});
