// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RejectDialog } from './RejectDialog';
import type { AdminOrder } from './api';

const onClose = vi.fn();
const onRejected = vi.fn();

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
    txid: 'a'.repeat(64),
    amountClaimed: '3',
    note: null,
    rejectReason: null,
    createdAt: '2026-09-10T00:00:00.000Z',
    decidedAt: null,
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
  onRejected.mockClear();
  onClose.mockClear();
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

it('rejects with the reason the admin wrote', async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe('/api/admin/orders/7/reject');
    expect(init?.method).toBe('POST');
    return Promise.resolve(
      jsonResponse(200, {
        order: adminOrder({
          status: 'rejected',
          rejectReason: 'Wrong amount.',
        }),
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  render(
    <RejectDialog
      order={adminOrder()}
      onRejected={onRejected}
      onClose={onClose}
    />,
  );
  await user.type(
    screen.getByTestId('reject-reason'),
    'Amount received does not match — sent 3 instead of 9.',
  );
  await user.click(screen.getByTestId('confirm-reject'));

  await waitFor(() => expect(onRejected).toHaveBeenCalled());
  const body = JSON.parse(
    (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string,
  ) as { reason: string };
  expect(body.reason).toBe(
    'Amount received does not match — sent 3 instead of 9.',
  );
});

it('cannot reject without a reason', async () => {
  const user = userEvent.setup();
  render(
    <RejectDialog
      order={adminOrder()}
      onRejected={onRejected}
      onClose={onClose}
    />,
  );

  expect(screen.getByTestId('confirm-reject')).toBeDisabled();

  await user.type(screen.getByTestId('reject-reason'), '   ');
  expect(screen.getByTestId('confirm-reject')).toBeDisabled();
});

it('shows the server’s error and stays open on failure', async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(jsonResponse(409, { error: 'Order not found.' })),
    ),
  );

  render(
    <RejectDialog
      order={adminOrder()}
      onRejected={onRejected}
      onClose={onClose}
    />,
  );
  await user.type(screen.getByTestId('reject-reason'), 'No payment arrived.');
  await user.click(screen.getByTestId('confirm-reject'));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Order not found.',
  );
  expect(onRejected).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});
