// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RejectDialog } from './RejectDialog';
import type { AdminOrder } from './api';
import { jsonResponse } from '../testing/json-response';

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
    paymentDeadline: null,
    paymentExpired: false,
    walletAddress: 'TTronWalletForTheTest',
    userEmail: 'reader@example.com',
    entitlement: null,
    ...overrides,
  };
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

it('offers a rate-move reason on a short LTC payment', async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(jsonResponse(200, { order: adminOrder() }))),
  );

  render(
    <RejectDialog
      order={adminOrder({
        coin: 'LTC',
        network: 'mainnet',
        amountExpected: '0.02',
        ltcRateUsdt: '320.5',
        amountClaimed: '0.0187',
      })}
      rateMoved
      onRejected={onRejected}
      onClose={onClose}
    />,
  );

  const suggestion = screen
    .getAllByTestId('reject-suggestion')
    .find((node) => /rate moved/i.test(node.textContent ?? ''));
  expect(suggestion).toBeDefined();
  await user.click(suggestion!);

  // One click fills a complete sentence: the text is read by the customer on
  // their Account page, so it has to say what to do, not name a category.
  const reason = (screen.getByTestId('reject-reason') as HTMLTextAreaElement)
    .value;
  expect(reason).toMatch(/rate moved/i);
  expect(reason).toMatch(/start a new order/i);
});

it('offers a new-order reason when the window has lapsed', async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(jsonResponse(200, { order: adminOrder() }))),
  );

  render(
    <RejectDialog
      order={adminOrder({
        paymentDeadline: '2026-09-10T06:00:00.000Z',
        paymentExpired: true,
      })}
      onRejected={onRejected}
      onClose={onClose}
    />,
  );

  const suggestions = screen.getAllByTestId('reject-suggestion');
  expect(suggestions).toHaveLength(1);
  await user.click(suggestions[0]!);
  const reason = (screen.getByTestId('reject-reason') as HTMLTextAreaElement)
    .value;
  expect(reason).toMatch(/payment window closed/i);
  expect(reason).toMatch(/start a new order/i);
});

it('withholds the rate-move reason when the queue has not established it', () => {
  render(
    <RejectDialog
      order={adminOrder({
        coin: 'LTC',
        network: 'mainnet',
        amountExpected: '0.02',
        ltcRateUsdt: '320.5',
        amountClaimed: '0.0187',
      })}
      onRejected={onRejected}
      onClose={onClose}
    />,
  );

  // Asserting a rate move the customer cannot check is a claim made to them,
  // not a suggestion made to the Admin. Only the queue holds the current rate,
  // so only the queue may say it.
  expect(screen.queryByTestId('reject-suggestions')).not.toBeInTheDocument();
});

it('offers no suggestions when nothing is short and no window lapsed', () => {
  render(
    <RejectDialog
      order={adminOrder({ amountClaimed: '9' })}
      onRejected={onRejected}
      onClose={onClose}
    />,
  );

  // The field stays free text, and an exact match is the Admin's own call.
  expect(screen.queryByTestId('reject-suggestions')).not.toBeInTheDocument();
});
