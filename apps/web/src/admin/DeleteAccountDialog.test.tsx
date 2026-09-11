// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import type { AdminUserDetail } from './api';

const onDeleted = vi.fn();
const onClose = vi.fn();

function adminUserDetail(): AdminUserDetail {
  return {
    id: 42,
    email: 'reader@example.com',
    isAdmin: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    entitlement: null,
    usage: { period: '2026-09', used: 0, comps: 0, allowance: 0 },
    orders: [],
  };
}

beforeEach(() => {
  onDeleted.mockClear();
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

it('explains what is removed and requires the email to confirm', async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe('/api/admin/users/42');
    expect(init?.method).toBe('DELETE');
    return Promise.resolve(new Response(null, { status: 204 }));
  });
  vi.stubGlobal('fetch', fetchMock);

  render(
    <DeleteAccountDialog
      user={adminUserDetail()}
      onDeleted={onDeleted}
      onClose={onClose}
    />,
  );

  expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  const confirm = screen.getByTestId('confirm-delete');
  expect(confirm).toBeDisabled();

  // A partial email is not enough.
  await user.type(screen.getByTestId('delete-confirm-email'), 'reader@');
  expect(confirm).toBeDisabled();

  await user.type(screen.getByTestId('delete-confirm-email'), 'example.com');
  expect(confirm).toBeEnabled();
  await user.click(confirm);

  await vi.waitFor(() => expect(onDeleted).toHaveBeenCalled());
});

it('surfaces server errors and keeps the dialog open', async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: 'You cannot delete the account you are signed in with.',
          }),
          { status: 409, headers: { 'content-type': 'application/json' } },
        ),
      ),
    ),
  );

  render(
    <DeleteAccountDialog
      user={adminUserDetail()}
      onDeleted={onDeleted}
      onClose={onClose}
    />,
  );

  await user.type(
    screen.getByTestId('delete-confirm-email'),
    'reader@example.com',
  );
  await user.click(screen.getByTestId('confirm-delete'));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'You cannot delete the account you are signed in with.',
  );
  expect(screen.getByTestId('delete-dialog')).toBeInTheDocument();
  expect(onDeleted).not.toHaveBeenCalled();
});
