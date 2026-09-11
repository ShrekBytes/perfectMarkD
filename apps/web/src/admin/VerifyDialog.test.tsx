// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VerifyDialog } from './VerifyDialog';
import type { AdminOrder } from './api';

const onClose = vi.fn();
const onVerified = vi.fn();

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
    amountClaimed: '9',
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
  onVerified.mockClear();
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

it('shows the order being decided and the user’s current entitlement state', () => {
  render(
    <VerifyDialog
      order={adminOrder()}
      onVerified={onVerified}
      onClose={onClose}
    />,
  );

  expect(screen.getByText('PM-7F3K2')).toBeInTheDocument();
  expect(screen.getByText(/reader@example.com/)).toBeInTheDocument();
  expect(screen.getByText(/no active entitlement/i)).toBeInTheDocument();
});

it('previews the stacked expiry when the user already has one', async () => {
  const user = userEvent.setup();
  render(
    <VerifyDialog
      order={adminOrder({
        entitlement: { plan: 'pro', expiresAt: '2026-10-05T00:00:00.000Z' },
      })}
      onVerified={onVerified}
      onClose={onClose}
    />,
  );

  expect(screen.getByText(/Pro until 2026-10-05/)).toBeInTheDocument();
  await user.click(screen.getByTestId('duration-3'));

  // 3 months stack onto 2026-10-05, not onto today.
  expect(screen.getByTestId('grant-preview')).toHaveTextContent('2027-01-05');
});

it('verifies with a preset duration and reports back', async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe('/api/admin/orders/7/verify');
    expect(init?.method).toBe('POST');
    return Promise.resolve(
      jsonResponse(200, {
        order: adminOrder({ status: 'verified' }),
        entitlement: { plan: 'pro', expiresAt: '2026-12-11T00:00:00.000Z' },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  render(
    <VerifyDialog
      order={adminOrder()}
      onVerified={onVerified}
      onClose={onClose}
    />,
  );
  await user.click(screen.getByTestId('duration-12'));
  await user.click(screen.getByTestId('confirm-verify'));

  await waitFor(() => expect(onVerified).toHaveBeenCalled());
  const body = JSON.parse(
    (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string,
  ) as Record<string, unknown>;
  expect(body).toEqual({ durationMonths: 12 });
});

it('verifies with a custom expiry date instead of a duration', async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe('/api/admin/orders/7/verify');
    expect(init?.method).toBe('POST');
    return Promise.resolve(
      jsonResponse(200, {
        order: adminOrder({ status: 'verified' }),
        entitlement: { plan: 'pro', expiresAt: '2027-01-05T23:59:59.999Z' },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  render(
    <VerifyDialog
      order={adminOrder()}
      onVerified={onVerified}
      onClose={onClose}
    />,
  );
  await user.type(screen.getByTestId('custom-expiry'), '2027-01-05');
  await user.click(screen.getByTestId('confirm-verify'));

  await waitFor(() => expect(onVerified).toHaveBeenCalled());
  const body = JSON.parse(
    (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string,
  ) as Record<string, unknown>;
  expect(body).toEqual({ expiresAt: '2027-01-05' });
});

it('cannot confirm before choosing a duration or a custom date', async () => {
  const user = userEvent.setup();
  render(
    <VerifyDialog
      order={adminOrder()}
      onVerified={onVerified}
      onClose={onClose}
    />,
  );

  expect(screen.getByTestId('confirm-verify')).toBeDisabled();

  await user.click(screen.getByTestId('duration-1'));
  expect(screen.getByTestId('confirm-verify')).toBeEnabled();
});

it('shows the server’s error and stays open on failure', async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        jsonResponse(409, { error: 'Only pending orders can be decided.' }),
      ),
    ),
  );

  render(
    <VerifyDialog
      order={adminOrder()}
      onVerified={onVerified}
      onClose={onClose}
    />,
  );
  await user.click(screen.getByTestId('duration-1'));
  await user.click(screen.getByTestId('confirm-verify'));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Only pending orders can be decided.',
  );
  expect(onVerified).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});
