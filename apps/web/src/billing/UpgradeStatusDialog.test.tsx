// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UpgradeStatusDialog } from './UpgradeStatusDialog';

const onClose = vi.fn();

function order(overrides: Partial<Record<string, unknown>> = {}) {
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

it('lists the user’s orders with their statuses', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        jsonResponse(200, {
          orders: [
            order({
              id: 2,
              referenceCode: 'PM-AAAAA',
              status: 'verified',
              decidedAt: '2026-09-11T00:00:00.000Z',
            }),
            order({ id: 1, referenceCode: 'PM-BBBBB' }),
          ],
        }),
      ),
    ),
  );

  render(<UpgradeStatusDialog onClose={onClose} />);

  const rows = await screen.findAllByTestId('order-row');
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent('PM-AAAAA');
  expect(rows[0]).toHaveTextContent('Verified');
  expect(rows[1]).toHaveTextContent('PM-BBBBB');
  // A pending order without submitted details says so and offers the form.
  expect(rows[1]).toHaveTextContent('Awaiting your payment details.');
  expect(
    screen.getByRole('button', { name: 'Enter payment details' }),
  ).toBeInTheDocument();
});

it('shows a rejected order’s reason with a resubmit action', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        jsonResponse(200, {
          orders: [
            order({
              status: 'rejected',
              rejectReason: 'Amount does not match the on-chain transaction.',
              decidedAt: '2026-09-11T00:00:00.000Z',
            }),
          ],
        }),
      ),
    ),
  );

  render(<UpgradeStatusDialog onClose={onClose} />);

  expect(await screen.findByTestId('order-reject-reason')).toHaveTextContent(
    /amount does not match/i,
  );
  expect(
    screen.getByRole('button', { name: 'Resubmit payment' }),
  ).toBeInTheDocument();
});

it('resubmission amends the same order and refreshes the list', async () => {
  const user = userEvent.setup();
  const urls: string[] = [];
  let submitted = false;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string | URL | Request, init?: RequestInit) => {
      urls.push(String(url));
      if (init?.method === 'POST') {
        expect(String(url)).toBe('/api/orders/1/submission');
        submitted = true;
        return Promise.resolve(
          jsonResponse(200, {
            order: order({ txid: 'b'.repeat(64), amountClaimed: '9' }),
          }),
        );
      }
      return Promise.resolve(
        jsonResponse(200, {
          orders: [
            submitted
              ? order({ txid: 'b'.repeat(64), amountClaimed: '9' })
              : order(),
          ],
        }),
      );
    }),
  );

  render(<UpgradeStatusDialog onClose={onClose} />);
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
  // The list reloaded: the row now reflects the submitted details…
  await waitFor(() =>
    expect(
      screen.getByText('Payment details submitted — awaiting verification.'),
    ).toBeInTheDocument(),
  );
  // …and the form collapsed.
  expect(screen.queryByTestId('payment-form')).not.toBeInTheDocument();
});

it('prefills a resubmission with the details being corrected', async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        jsonResponse(200, {
          orders: [
            order({
              status: 'rejected',
              rejectReason: 'Amount does not match the on-chain transaction.',
              txid: 'c'.repeat(64),
              amountClaimed: '8',
              note: 'sent from an exchange',
              decidedAt: '2026-09-11T00:00:00.000Z',
            }),
          ],
        }),
      ),
    ),
  );

  render(<UpgradeStatusDialog onClose={onClose} />);
  await user.click(
    await screen.findByRole('button', { name: 'Resubmit payment' }),
  );

  // "Corrected details" means editing what was there — not retyping blind.
  expect(await screen.findByLabelText(/transaction id/i)).toHaveValue(
    'c'.repeat(64),
  );
  expect(screen.getByLabelText(/amount sent/i)).toHaveValue(8);
  expect(screen.getByLabelText(/note/i)).toHaveValue('sent from an exchange');
});

it('shows a friendly empty state pointing at the plans', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(jsonResponse(200, { orders: [] }))),
  );

  render(<UpgradeStatusDialog onClose={onClose} />);

  expect(await screen.findByText('No orders yet.')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'View plans' }),
  ).toBeInTheDocument();
});

it('recovers from a failed load via Retry', async () => {
  const user = userEvent.setup();
  let failing = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      if (failing) return Promise.reject(new TypeError('network down'));
      return Promise.resolve(jsonResponse(200, { orders: [order()] }));
    }),
  );

  render(<UpgradeStatusDialog onClose={onClose} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(/network down/i);

  failing = false;
  await user.click(screen.getByRole('button', { name: 'Retry' }));

  expect(await screen.findByTestId('order-row')).toBeInTheDocument();
});
