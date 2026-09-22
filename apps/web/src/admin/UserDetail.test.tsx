// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UserDetail } from './UserDetail';
import type { AdminUserDetail } from './api';

const onBack = vi.fn();
const onChanged = vi.fn();

function adminUserDetail(
  overrides: Partial<AdminUserDetail> = {},
): AdminUserDetail {
  return {
    id: 42,
    email: 'reader@example.com',
    isAdmin: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    entitlement: { plan: 'pro', expiresAt: '2027-01-05T00:00:00.000Z' },
    usage: { period: '2026-09', used: 300, comps: 10, allowance: 310 },
    aiUsage: { period: '2026-09', used: 12, allowance: 100, remaining: 88 },
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

/**
 * A stateful mock: `detail` is a getter so mutations can flip the served
 * state — the panel re-reads the user after every action, like it does live.
 * `mutations` are matched by path and method before the detail fallback.
 */
function mockApi(
  detail: () => AdminUserDetail,
  mutations: Array<{
    path: string;
    method: string;
    respond: () => Response;
  }> = [],
) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const mutation = mutations.find(
      (m) => m.path === url && m.method === (init?.method ?? ''),
    );
    if (mutation) return Promise.resolve(mutation.respond());
    if (url === '/api/admin/users/42' && method === 'GET') {
      return Promise.resolve(jsonResponse(200, { user: detail() }));
    }
    return Promise.reject(new Error(`unexpected fetch: ${method} ${url}`));
  });
}

beforeEach(() => {
  onBack.mockClear();
  onChanged.mockClear();
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

it('shows entitlement, usage with comps, and the action buttons', async () => {
  vi.stubGlobal(
    'fetch',
    mockApi(() => adminUserDetail()),
  );

  render(<UserDetail userId={42} onBack={onBack} onChanged={onChanged} />);

  expect(await screen.findByTestId('user-entitlement')).toHaveTextContent(
    'Pro until 2027-01-05',
  );
  expect(screen.getByTestId('user-usage')).toHaveTextContent(
    '300 of 310 used (2026-09) — includes 10 comped',
  );
  expect(screen.getByTestId('user-ai-usage')).toHaveTextContent(
    '12 of 100 used (2026-09) — 88 remaining',
  );
  expect(screen.getByTestId('user-grant')).toHaveTextContent('Extend');
  expect(screen.getByTestId('user-revoke')).toBeInTheDocument();
  expect(screen.getByTestId('user-comp')).toBeInTheDocument();
  expect(screen.getByTestId('user-reset-password')).toBeInTheDocument();
  expect(screen.getByTestId('user-delete')).toBeInTheDocument();
  expect(onChanged).toHaveBeenCalled();
});

it('shows the AI count without an allowance when the plan has none', async () => {
  vi.stubGlobal(
    'fetch',
    mockApi(() =>
      adminUserDetail({
        entitlement: null,
        aiUsage: { period: '2026-09', used: 3, allowance: 0, remaining: 0 },
      }),
    ),
  );

  render(<UserDetail userId={42} onBack={onBack} onChanged={onChanged} />);

  expect(await screen.findByTestId('user-ai-usage')).toHaveTextContent(
    '3 used (2026-09) — no AI allowance on this plan',
  );
});

it('grants an entitlement and refreshes to the new state', async () => {
  const user = userEvent.setup();
  let current = adminUserDetail();
  vi.stubGlobal(
    'fetch',
    mockApi(
      () => current,
      [
        {
          path: '/api/admin/users/42/entitlement',
          method: 'POST',
          respond: () => {
            current = adminUserDetail({
              entitlement: {
                plan: 'premium',
                expiresAt: '2026-12-11T00:00:00.000Z',
              },
              usage: {
                period: '2026-09',
                used: 300,
                comps: 10,
                allowance: 1010,
              },
            });
            return jsonResponse(200, { user: current });
          },
        },
      ],
    ),
  );

  render(<UserDetail userId={42} onBack={onBack} onChanged={onChanged} />);
  await user.click(await screen.findByTestId('user-grant'));

  // The grant dialog opens with plan and duration choices.
  await user.click(screen.getByTestId('grant-plan-premium'));
  await user.click(screen.getByTestId('grant-duration-3'));
  await user.click(screen.getByTestId('confirm-grant'));

  // The detail refreshed to the granted state, list notified, dialog closed.
  expect(await screen.findByTestId('user-entitlement')).toHaveTextContent(
    'Premium until 2026-12-11',
  );
  expect(screen.getByTestId('user-usage')).toHaveTextContent('1010');
  expect(onChanged).toHaveBeenCalled();
  expect(screen.queryByTestId('grant-dialog')).not.toBeInTheDocument();
});

it('comps quota and shows the new allowance', async () => {
  const user = userEvent.setup();
  let current = adminUserDetail();
  vi.stubGlobal(
    'fetch',
    mockApi(
      () => current,
      [
        {
          path: '/api/admin/users/42/quota/comp',
          method: 'POST',
          respond: () => {
            current = adminUserDetail({
              usage: {
                period: '2026-09',
                used: 300,
                comps: 60,
                allowance: 360,
              },
            });
            return jsonResponse(200, { user: current });
          },
        },
      ],
    ),
  );

  render(<UserDetail userId={42} onBack={onBack} onChanged={onChanged} />);
  await user.click(await screen.findByTestId('user-comp'));

  await user.type(screen.getByTestId('comp-amount'), '50');
  await user.click(screen.getByTestId('confirm-comp'));

  expect(await screen.findByTestId('user-usage')).toHaveTextContent(
    '300 of 360 used',
  );
  expect(screen.queryByTestId('comp-dialog')).not.toBeInTheDocument();
});

it('resets a password and shows the temp password once', async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'fetch',
    mockApi(
      () => adminUserDetail(),
      [
        {
          path: '/api/admin/users/42/password',
          method: 'POST',
          respond: () =>
            jsonResponse(200, { temporaryPassword: 'temp-pass-1234' }),
        },
      ],
    ),
  );

  render(<UserDetail userId={42} onBack={onBack} onChanged={onChanged} />);
  await user.click(await screen.findByTestId('user-reset-password'));
  await user.click(screen.getByTestId('confirm-reset'));

  expect(await screen.findByTestId('temp-password')).toHaveTextContent(
    'temp-pass-1234',
  );
});

it('deletes the account after typing the email and returns to the list', async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'fetch',
    mockApi(
      () => adminUserDetail(),
      [
        {
          path: '/api/admin/users/42',
          method: 'DELETE',
          respond: () => new Response(null, { status: 204 }),
        },
      ],
    ),
  );

  render(<UserDetail userId={42} onBack={onBack} onChanged={onChanged} />);
  await screen.findByTestId('user-grant');
  await user.click(screen.getByTestId('user-delete'));

  // The confirm button stays disabled until the email matches.
  expect(screen.getByTestId('confirm-delete')).toBeDisabled();
  await user.type(
    screen.getByTestId('delete-confirm-email'),
    'reader@example.com',
  );
  await user.click(screen.getByTestId('confirm-delete'));

  await waitFor(() => expect(onBack).toHaveBeenCalled());
  expect(onChanged).toHaveBeenCalled();
});

it('revokes the entitlement and refreshes', async () => {
  const user = userEvent.setup();
  let current = adminUserDetail();
  vi.stubGlobal(
    'fetch',
    mockApi(
      () => current,
      [
        {
          path: '/api/admin/users/42/entitlement',
          method: 'DELETE',
          respond: () => {
            current = adminUserDetail({ entitlement: null });
            return jsonResponse(200, { user: current });
          },
        },
      ],
    ),
  );

  render(<UserDetail userId={42} onBack={onBack} onChanged={onChanged} />);
  await user.click(await screen.findByTestId('user-revoke'));
  await user.click(screen.getByTestId('confirm-revoke'));

  expect(await screen.findByTestId('user-entitlement')).toHaveTextContent(
    'No active entitlement.',
  );
  expect(screen.queryByTestId('revoke-dialog')).not.toBeInTheDocument();
});
