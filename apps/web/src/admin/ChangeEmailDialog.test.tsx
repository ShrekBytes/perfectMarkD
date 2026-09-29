// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChangeEmailDialog } from './ChangeEmailDialog';
import type { AdminUserDetail } from './api';
import { jsonResponse } from '../testing/json-response';

const onDone = vi.fn();
const onClose = vi.fn();

function adminUserDetail(): AdminUserDetail {
  return {
    id: 42,
    email: 'dead@example.com',
    isAdmin: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    entitlement: null,
    usage: { period: '2026-09', used: 0, comps: 0, allowance: 0 },
    aiUsage: { period: '2026-09', used: 0, allowance: 0, remaining: 0 },
    orders: [],
  };
}

/** Asserts the request the panel makes, and answers it. */
function stubChange(body: unknown, status = 200) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe('/api/admin/users/42/email');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'moved@example.com',
    });
    return Promise.resolve(jsonResponse(status, body));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderDialog() {
  return render(
    <ChangeEmailDialog
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

it('sends the link to the new address and says nothing has moved yet', async () => {
  // Story 22: the account follows the link, not the panel — so the confirmation
  // names the new inbox and states plainly that the old address is still in use.
  const user = userEvent.setup();
  stubChange({ email: 'moved@example.com' });

  renderDialog();

  // The address in use is the one being replaced, and the copy says so.
  expect(screen.getByTestId('change-email-current')).toHaveTextContent(
    'dead@example.com',
  );
  expect(screen.getByText(/nothing changes until/i)).toBeInTheDocument();

  await user.type(
    screen.getByTestId('change-email-input'),
    'moved@example.com',
  );
  await user.click(screen.getByTestId('confirm-change-email'));

  const sent = await screen.findByRole('status');
  expect(sent).toHaveTextContent('moved@example.com');
  // The link goes to the new address, so the dead one is not the one to watch.
  expect(sent).toHaveTextContent(/dead@example\.com/);
  expect(onDone).toHaveBeenCalled();

  await user.click(screen.getByTestId('change-email-done'));
  expect(onClose).toHaveBeenCalled();
});

it('keeps the form and the typed address when the server refuses it', async () => {
  const user = userEvent.setup();
  stubChange({ error: 'That is already the user’s login email.' }, 400);

  renderDialog();
  await user.type(
    screen.getByTestId('change-email-input'),
    'moved@example.com',
  );
  await user.click(screen.getByTestId('confirm-change-email'));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'already the user’s login email',
  );
  // A refused request sent nothing, so the Admin can correct the address in
  // place rather than start over.
  expect(screen.getByTestId('change-email-input')).toHaveValue(
    'moved@example.com',
  );
  expect(onDone).not.toHaveBeenCalled();
});

it('will not send an empty address', async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn(() => Promise.reject(new Error('unexpected fetch')));
  vi.stubGlobal('fetch', fetchMock);

  renderDialog();

  expect(screen.getByTestId('confirm-change-email')).toBeDisabled();
  await user.type(screen.getByTestId('change-email-input'), 'a');
  expect(screen.getByTestId('confirm-change-email')).toBeEnabled();
  expect(fetchMock).not.toHaveBeenCalled();
});
