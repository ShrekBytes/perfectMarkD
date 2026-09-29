// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SendResetLinkDialog } from './SendResetLinkDialog';
import type { AdminUserDetail } from './api';
import { jsonResponse } from '../testing/json-response';

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

function stubSend(body: unknown, status = 200) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe('/api/admin/users/42/password');
    expect(init?.method).toBe('POST');
    return Promise.resolve(jsonResponse(status, body));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderDialog() {
  return render(
    <SendResetLinkDialog
      user={adminUserDetail()}
      onDone={onDone}
      onClose={onClose}
    />,
  );
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

it('promises no password and shows nothing but a link once it is sent', async () => {
  // Story 21: the Admin never sees or sets a password. The confirmation names
  // the inbox to watch, because the whole job now ends with the user.
  const user = userEvent.setup();
  stubSend({ sent: true, kind: 'password_reset', expiresInMinutes: 30 });

  renderDialog();

  // The copy the whole change turns on: there is no password to hand over.
  expect(screen.getByText(/no password is shown/i)).toBeInTheDocument();
  expect(screen.queryByTestId('temp-password')).not.toBeInTheDocument();

  await user.click(screen.getByTestId('confirm-send-reset-link'));

  const sent = await screen.findByRole('status');
  expect(sent).toHaveTextContent('reader@example.com');
  expect(sent).toHaveTextContent(/30 minutes/i);
  // Nothing about the account changed, so the panel is not stale — but the
  // confirmation is the answer, and closing it is the only thing left to do.
  expect(
    screen.queryByTestId('confirm-send-reset-link'),
  ).not.toBeInTheDocument();
  expect(onDone).toHaveBeenCalled();

  await user.click(screen.getByTestId('reset-link-done'));
  expect(onClose).toHaveBeenCalled();
});

it('says a verification link went instead for an unverified account', async () => {
  // A reset link buys an unverified account nothing — sign-in is still locked —
  // so the server sends the link that can, and the panel reports which one it
  // was rather than claiming a reset the user cannot finish.
  const user = userEvent.setup();
  stubSend({ sent: true, kind: 'verification', expiresInMinutes: 1440 });

  renderDialog();
  await user.click(screen.getByTestId('confirm-send-reset-link'));

  const sent = await screen.findByRole('status');
  expect(sent).toHaveTextContent(/verification link/i);
  // The window is the one the server reported, not a copy of it: 24 hours here,
  // where a reset link would have said 30 minutes.
  expect(sent).toHaveTextContent('24 hours');
  expect(sent).not.toHaveTextContent('30 minutes');
});

it('surfaces server errors without losing the dialog', async () => {
  const user = userEvent.setup();
  stubSend({ error: 'User not found.' }, 404);

  renderDialog();
  await user.click(screen.getByTestId('confirm-send-reset-link'));

  expect(await screen.findByRole('alert')).toHaveTextContent('User not found.');
  expect(screen.getByTestId('send-reset-link-dialog')).toBeInTheDocument();
  expect(screen.getByTestId('confirm-send-reset-link')).toBeInTheDocument();
  expect(onDone).not.toHaveBeenCalled();
});
