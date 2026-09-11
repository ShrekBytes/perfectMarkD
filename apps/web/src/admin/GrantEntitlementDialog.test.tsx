// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GrantEntitlementDialog } from './GrantEntitlementDialog';
import type { AdminUserDetail } from './api';

const onGranted = vi.fn();
const onClose = vi.fn();

function adminUserDetail(
  overrides: Partial<AdminUserDetail> = {},
): AdminUserDetail {
  return {
    id: 42,
    email: 'reader@example.com',
    isAdmin: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    entitlement: { plan: 'pro', expiresAt: '2026-10-05T00:00:00.000Z' },
    usage: { period: '2026-09', used: 0, comps: 0, allowance: 300 },
    orders: [],
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
  onGranted.mockClear();
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

it('shows the current entitlement and defaults to the Pro plan', () => {
  render(
    <GrantEntitlementDialog
      user={adminUserDetail()}
      onGranted={onGranted}
      onClose={onClose}
    />,
  );

  expect(screen.getByTestId('grant-current')).toHaveTextContent(
    'Current: Pro until 2026-10-05',
  );
  expect(screen.getByTestId('grant-plan-pro')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByTestId('confirm-grant')).toBeDisabled();
});

it('previews a duration stacking onto the current expiry', async () => {
  const user = userEvent.setup();
  render(
    <GrantEntitlementDialog
      user={adminUserDetail()}
      onGranted={onGranted}
      onClose={onClose}
    />,
  );

  await user.click(screen.getByTestId('grant-duration-1'));
  expect(screen.getByTestId('grant-preview')).toHaveTextContent(
    'Pro until 2026-11-05',
  );
  expect(screen.getByTestId('grant-preview')).toHaveTextContent(
    'from the current expiry',
  );
});

it('grants a plan and duration, reporting back', async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe('/api/admin/users/42/entitlement');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      plan: 'premium',
      durationMonths: 6,
    });
    return Promise.resolve(jsonResponse(200, { user: adminUserDetail() }));
  });
  vi.stubGlobal('fetch', fetchMock);

  render(
    <GrantEntitlementDialog
      user={adminUserDetail()}
      onGranted={onGranted}
      onClose={onClose}
    />,
  );

  await user.click(screen.getByTestId('grant-plan-premium'));
  await user.click(screen.getByTestId('grant-duration-6'));
  await user.click(screen.getByTestId('confirm-grant'));

  await vi.waitFor(() => expect(onGranted).toHaveBeenCalled());
});

it('grants an exact custom expiry and shows it as set exactly', async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    expect(JSON.parse(String(init?.body))).toEqual({
      plan: 'pro',
      expiresAt: '2027-01-05',
    });
    return Promise.resolve(jsonResponse(200, { user: adminUserDetail() }));
  });
  vi.stubGlobal('fetch', fetchMock);

  render(
    <GrantEntitlementDialog
      user={adminUserDetail({ entitlement: null })}
      onGranted={onGranted}
      onClose={onClose}
    />,
  );

  await user.type(screen.getByTestId('grant-custom-expiry'), '2027-01-05');
  expect(screen.getByTestId('grant-preview')).toHaveTextContent('set exactly');
  await user.click(screen.getByTestId('confirm-grant'));

  await vi.waitFor(() => expect(onGranted).toHaveBeenCalled());
});

it('shows the server error and keeps the dialog open on failure', async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        jsonResponse(400, {
          error: 'Choose a duration of 1, 3, 6, or 12 months.',
        }),
      ),
    ),
  );

  render(
    <GrantEntitlementDialog
      user={adminUserDetail()}
      onGranted={onGranted}
      onClose={onClose}
    />,
  );

  await user.click(screen.getByTestId('grant-duration-3'));
  await user.click(screen.getByTestId('confirm-grant'));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Choose a duration of 1, 3, 6, or 12 months.',
  );
  expect(screen.getByTestId('grant-dialog')).toBeInTheDocument();
  expect(onGranted).not.toHaveBeenCalled();
});
