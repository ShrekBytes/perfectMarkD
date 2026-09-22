// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ResetPasswordDialog } from './ResetPasswordDialog';
import type { AdminUserDetail } from './api';

const onDone = vi.fn();
const onClose = vi.fn();

function adminUserDetail(): AdminUserDetail {
  return {
    id: 42,
    email: 'reader@example.com',
    isAdmin: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    entitlement: null,
    usage: { period: '2026-09', used: 0, comps: 0, allowance: 0 },
    aiUsage: { period: '2026-09', used: 0, allowance: 0, remaining: 0 },
    orders: [],
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  onDone.mockClear();
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

it('warns before generating and hands over the temp password once', async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe('/api/admin/users/42/password');
    expect(init?.method).toBe('POST');
    return Promise.resolve(
      jsonResponse(200, { temporaryPassword: 'generated-temp-pass' }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  render(
    <ResetPasswordDialog
      user={adminUserDetail()}
      onDone={onDone}
      onClose={onClose}
    />,
  );

  expect(screen.getByText(/no email is sent/i)).toBeInTheDocument();

  await user.click(screen.getByTestId('confirm-reset'));

  expect(await screen.findByTestId('temp-password')).toHaveTextContent(
    'generated-temp-pass',
  );
  expect(onDone).toHaveBeenCalled();
  expect(screen.queryByTestId('confirm-reset')).not.toBeInTheDocument();

  await user.click(screen.getByTestId('temp-password-done'));
  expect(onClose).toHaveBeenCalled();
});

it('surfaces server errors without losing the dialog', async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        jsonResponse(409, {
          error:
            'Use “Change password” in your account menu to change your own password.',
        }),
      ),
    ),
  );

  render(
    <ResetPasswordDialog
      user={adminUserDetail()}
      onDone={onDone}
      onClose={onClose}
    />,
  );

  await user.click(screen.getByTestId('confirm-reset'));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Use “Change password”',
  );
  expect(screen.getByTestId('reset-password-dialog')).toBeInTheDocument();
  expect(onDone).not.toHaveBeenCalled();
});
