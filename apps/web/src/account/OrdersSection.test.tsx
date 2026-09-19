// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OrdersSection } from './OrdersSection';
import type { Order } from '../billing/api';
import { jsonResponse } from '../testing/json-response';

const onRefresh = vi.fn();

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 1,
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
    walletAddress: 'TTronWalletForTheTest',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
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

it('lists the orders with their statuses as compact rows', () => {
  render(
    <OrdersSection
      orders={[
        order({
          id: 2,
          referenceCode: 'PM-AAAAA',
          status: 'verified',
          decidedAt: '2026-09-11T00:00:00.000Z',
        }),
        order({ id: 1, referenceCode: 'PM-BBBBB' }),
      ]}
      error={null}
      onRefresh={onRefresh}
    />,
  );

  const rows = screen.getAllByTestId('order-row');
  expect(rows).toHaveLength(2);
  // Compact rows: reference code, date, plan and duration, amount, badge.
  expect(rows[0]).toHaveTextContent('PM-AAAAA');
  expect(rows[0]).toHaveTextContent('Verified');
  expect(rows[0]).toHaveTextContent('Created 2026-09-10');
  expect(rows[0]).toHaveTextContent('Decided 2026-09-11');
  expect(rows[1]).toHaveTextContent('Pending');
  // A pending Order without details offers the form; a verified one doesn't.
  expect(
    screen.getByRole('button', { name: 'Enter payment details' }),
  ).toBeInTheDocument();
  expect(within(rows[0]!).queryByRole('button')).not.toBeInTheDocument();
});

it('shows the awaiting-verification strip once details are submitted', () => {
  render(
    <OrdersSection
      orders={[order({ txid: 'a'.repeat(64), amountClaimed: '9' })]}
      error={null}
      onRefresh={onRefresh}
    />,
  );

  expect(screen.getByTestId('orders-pending-strip')).toHaveTextContent(
    /awaiting verification/i,
  );
  // The details are in — the expand becomes "Edit details".
  expect(screen.getByRole('button', { name: 'Edit details' })).toBeInTheDocument();
});

it('shows the strip without a verification claim while details are missing', () => {
  render(
    <OrdersSection orders={[order()]} error={null} onRefresh={onRefresh} />,
  );

  const strip = screen.getByTestId('orders-pending-strip');
  expect(strip).toHaveTextContent(/awaiting your payment details/i);
  expect(
    screen.getByRole('button', { name: 'Enter payment details' }),
  ).toBeInTheDocument();
});

it('renders no strip when no Order is pending', () => {
  render(
    <OrdersSection
      orders={[order({ status: 'verified' })]}
      error={null}
      onRefresh={onRefresh}
    />,
  );

  expect(screen.queryByTestId('orders-pending-strip')).not.toBeInTheDocument();
});

it('shows a rejected order’s reason when expanded, with a resubmit action', async () => {
  const user = userEvent.setup();
  render(
    <OrdersSection
      orders={[
        order({
          status: 'rejected',
          rejectReason: 'Amount does not match the on-chain transaction.',
          txid: 'c'.repeat(64),
          amountClaimed: '8',
          decidedAt: '2026-09-11T00:00:00.000Z',
        }),
      ]}
      error={null}
      onRefresh={onRefresh}
    />,
  );

  // Collapsed: the badge names the state; the reason waits for the expand.
  expect(screen.getByTestId('order-status')).toHaveTextContent('Rejected');
  expect(screen.queryByTestId('order-reject-reason')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Resubmit payment' }));

  expect(screen.getByTestId('order-reject-reason')).toHaveTextContent(
    /amount does not match/i,
  );
  // "Corrected details" means editing what was there — not retyping blind.
  expect(await screen.findByLabelText(/transaction id/i)).toHaveValue(
    'c'.repeat(64),
  );
});

it('resubmission amends the same order and refreshes the list', async () => {
  const user = userEvent.setup();
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string | URL | Request, init?: RequestInit) => {
      urls.push(String(url));
      if (init?.method === 'POST') {
        expect(String(url)).toBe('/api/orders/1/submission');
        return Promise.resolve(
          jsonResponse(200, {
            order: order({ txid: 'b'.repeat(64), amountClaimed: '9' }),
          }),
        );
      }
      return Promise.reject(new Error('unexpected fetch'));
    }),
  );

  render(
    <OrdersSection orders={[order()]} error={null} onRefresh={onRefresh} />,
  );
  await user.click(
    await screen.findByRole('button', { name: 'Enter payment details' }),
  );

  // The instructions are right there — the user needs them to pay.
  expect(await screen.findByTestId('payment-instructions')).toBeInTheDocument();
  expect(screen.getByText('TTronWalletForTheTest')).toBeInTheDocument();

  await user.type(screen.getByLabelText(/transaction id/i), 'b'.repeat(64));
  await user.click(
    screen.getByRole('button', { name: /Submit payment details/ }),
  );

  await waitFor(() => expect(urls).toContain('/api/orders/1/submission'));
  expect(onRefresh).toHaveBeenCalledTimes(1);
  // The form collapsed after submission.
  expect(screen.queryByTestId('payment-form')).not.toBeInTheDocument();
});

it('shows a friendly empty state pointing at the plans', () => {
  render(<OrdersSection orders={[]} error={null} onRefresh={onRefresh} />);

  expect(screen.getByText('No orders yet.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View plans' })).toHaveAttribute(
    'href',
    '/pricing',
  );
});

it('shows the loading state', () => {
  render(<OrdersSection orders={null} error={null} onRefresh={onRefresh} />);

  expect(screen.getByText('Loading your orders…')).toBeInTheDocument();
});

it('offers a Retry when the load failed', async () => {
  const user = userEvent.setup();
  render(
    <OrdersSection orders={null} error="network down" onRefresh={onRefresh} />,
  );

  expect(screen.getByRole('alert')).toHaveTextContent(/network down/i);

  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(onRefresh).toHaveBeenCalledTimes(1);
});
