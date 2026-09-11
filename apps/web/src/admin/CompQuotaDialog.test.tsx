// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CompQuotaDialog } from './CompQuotaDialog';
import type { AdminUserDetail } from './api';

const onComp = vi.fn();
const onClose = vi.fn();

function adminUserDetail(overrides: Partial<AdminUserDetail> = {}) {
  return {
    id: 42,
    email: 'reader@example.com',
    isAdmin: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    entitlement: { plan: 'pro', expiresAt: '2027-01-05T00:00:00.000Z' },
    usage: { period: '2026-09', used: 300, comps: 0, allowance: 300 },
    orders: [],
    ...overrides,
  } as AdminUserDetail;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  onComp.mockClear();
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

it('shows the current usage and starts with an empty amount', () => {
  render(
    <CompQuotaDialog
      user={adminUserDetail()}
      onComp={onComp}
      onClose={onClose}
    />,
  );

  expect(screen.getByTestId('comp-current')).toHaveTextContent(
    '300 of 300 exports used (2026-09) · 0 comped',
  );
  expect(screen.getByTestId('confirm-comp')).toBeDisabled();
});

it('applies a positive comp for the current period', async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe('/api/admin/users/42/quota/comp');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ amount: 50 });
    return Promise.resolve(jsonResponse(200, { user: adminUserDetail() }));
  });
  vi.stubGlobal('fetch', fetchMock);

  render(
    <CompQuotaDialog
      user={adminUserDetail()}
      onComp={onComp}
      onClose={onClose}
    />,
  );

  await user.type(screen.getByTestId('comp-amount'), '50');
  await user.click(screen.getByTestId('confirm-comp'));

  await vi.waitFor(() => expect(onComp).toHaveBeenCalled());
});

it('refuses zero, fractions, and empty input before submitting', async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn(() =>
    Promise.reject(new Error('should not be called')),
  );
  vi.stubGlobal('fetch', fetchMock);

  render(
    <CompQuotaDialog
      user={adminUserDetail()}
      onComp={onComp}
      onClose={onClose}
    />,
  );

  const confirm = screen.getByTestId('confirm-comp');
  await user.type(screen.getByTestId('comp-amount'), '0');
  expect(confirm).toBeDisabled();
  await user.clear(screen.getByTestId('comp-amount'));
  await user.type(screen.getByTestId('comp-amount'), '2.5');
  expect(confirm).toBeDisabled();

  expect(fetchMock).not.toHaveBeenCalled();
  expect(onComp).not.toHaveBeenCalled();
});

it('surfaces the server error when comps would go below zero', async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        jsonResponse(400, {
          error: 'Comps for this period cannot go below zero.',
        }),
      ),
    ),
  );

  render(
    <CompQuotaDialog
      user={adminUserDetail({
        usage: { period: '2026-09', used: 0, comps: 10, allowance: 310 },
      })}
      onComp={onComp}
      onClose={onClose}
    />,
  );

  await user.type(screen.getByTestId('comp-amount'), '-100');
  await user.click(screen.getByTestId('confirm-comp'));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Comps for this period cannot go below zero.',
  );
  expect(onComp).not.toHaveBeenCalled();
});
