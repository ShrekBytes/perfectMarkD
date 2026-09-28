// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { PaymentInstructions } from './PaymentInstructions';
import type { Order } from './api';

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
    paymentDeadline: null,
    paymentExpired: false,
    walletAddress: 'TTronWalletForTheTest',
    ...overrides,
  };
}

afterEach(cleanup);

it('names the deadline while the window is open', () => {
  render(
    <PaymentInstructions
      order={order({ paymentDeadline: '2099-06-11T18:00:00.000Z' })}
    />,
  );

  // An amount nobody can still pay is not an instruction, so the deadline sits
  // with the amount rather than below the fold of a network warning.
  expect(screen.getByTestId('payment-deadline')).toHaveTextContent(
    /payable until .*cannot be paid after that/i,
  );
  expect(screen.queryByTestId('payment-window-lapsed')).not.toBeInTheDocument();
});

it('says the window closed, and not that the order is cancelled', () => {
  render(
    <PaymentInstructions
      order={order({
        paymentDeadline: '2026-09-10T06:00:00.000Z',
        paymentExpired: true,
      })}
    />,
  );

  const lapsed = screen.getByTestId('payment-window-lapsed');
  expect(lapsed).toHaveTextContent(/can no longer be paid/i);
  // "Cancelled" would tell the customer something happened to their money
  // that did not. A lapsed window is a quote that closed.
  expect(lapsed).toHaveTextContent(/not cancelled/i);
  expect(lapsed).toHaveTextContent(/start a new order/i);
  expect(screen.queryByTestId('payment-deadline')).not.toBeInTheDocument();
});

it('says nothing about a window on an Order that has none', () => {
  render(<PaymentInstructions order={order()} />);

  // Orders predating the window are exempt, and a null deadline must not read
  // as a lapsed one.
  expect(screen.queryByTestId('payment-deadline')).not.toBeInTheDocument();
  expect(screen.queryByTestId('payment-window-lapsed')).not.toBeInTheDocument();
});

it('does not blame the rate for a lapsed USDT window', () => {
  render(
    <PaymentInstructions
      order={order({
        paymentDeadline: '2026-09-10T06:00:00.000Z',
        paymentExpired: true,
      })}
    />,
  );

  // A USDT order has no Rate at all. Nothing moved.
  expect(screen.getByTestId('payment-window-lapsed')).not.toHaveTextContent(
    /rate/i,
  );
});

it('keeps naming the coin actually demanded', () => {
  render(
    <PaymentInstructions
      order={order({
        coin: 'LTC',
        network: 'mainnet',
        amountExpected: '0.028',
        ltcRateUsdt: '320.5',
        paymentDeadline: '2099-06-11T18:00:00.000Z',
      })}
    />,
  );

  // The deadline is new copy; the amount is still the coin they send.
  expect(screen.getByTestId('order-amount')).toHaveTextContent('0.028 LTC');
  expect(screen.getByTestId('payment-deadline')).toBeInTheDocument();
});
