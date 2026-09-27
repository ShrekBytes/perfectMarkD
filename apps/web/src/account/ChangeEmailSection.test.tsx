// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChangeEmailSection } from './ChangeEmailSection';
import * as authApi from '../auth/api';
import { AuthError } from '../auth/api';
import { useAccountStore } from '../auth/account-store';

const CURRENT = 'reader@example.com';

beforeEach(() => {
  useAccountStore.setState({
    user: { email: CURRENT, isAdmin: false },
    status: 'ready',
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Fills the form the way a user does, then submits it. */
async function submit(
  user: ReturnType<typeof userEvent.setup>,
  email: string,
  password: string,
) {
  await user.clear(screen.getByLabelText('New email address'));
  await user.type(screen.getByLabelText('New email address'), email);
  await user.type(screen.getByLabelText('Current password'), password);
  await user.click(screen.getByRole('button', { name: 'Send the link' }));
}

it('shows the address in use, and sends the new one with the current password', async () => {
  const user = userEvent.setup();
  // The server owns the shape of the address, so the form names the inbox the
  // server recorded — not what was typed into it.
  const request = vi
    .spyOn(authApi, 'requestEmailChange')
    .mockResolvedValue('moved@example.com');

  render(<ChangeEmailSection />);
  await submit(user, 'Moved@Example.com', 'correct horse battery');

  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(request).toHaveBeenCalledWith(
    'Moved@Example.com',
    'correct horse battery',
  );
  // Which inbox to watch, and the promise that decides it — nothing changes
  // until the link in that inbox is opened.
  expect(await screen.findByTestId('change-email-sent')).toHaveTextContent(
    'moved@example.com',
  );
  // The address in use has not moved yet, so it is still what the page shows.
  expect(screen.getByTestId('change-email-current')).toHaveTextContent(CURRENT);
});

it('lets a mistyped address be corrected without reloading the page', async () => {
  const user = userEvent.setup();
  vi.spyOn(authApi, 'requestEmailChange').mockResolvedValue('typo@example.com');

  render(<ChangeEmailSection />);
  await submit(user, 'typo@example.com', 'correct horse battery');
  await screen.findByTestId('change-email-sent');

  await user.click(screen.getByRole('button', { name: /different address/i }));

  expect(screen.queryByTestId('change-email-sent')).not.toBeInTheDocument();
  expect(screen.getByLabelText('New email address')).toHaveValue(
    'typo@example.com',
  );
});

it('flags the fields when the current password is wrong', async () => {
  const user = userEvent.setup();
  vi.spyOn(authApi, 'requestEmailChange').mockRejectedValue(
    new AuthError('Current password is incorrect.', 401),
  );

  render(<ChangeEmailSection />);
  await submit(user, 'moved@example.com', 'wrong-pass');

  expect(await screen.findByRole('alert')).toHaveTextContent(
    /current password is incorrect/i,
  );
  expect(screen.getByLabelText('Current password')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  // Nothing was sent, so the form stays open with what was typed.
  expect(screen.queryByTestId('change-email-sent')).not.toBeInTheDocument();
  expect(screen.getByLabelText('New email address')).toHaveValue(
    'moved@example.com',
  );
});

it('does not flag the fields for a server failure', async () => {
  // A 5xx is ours, not the user's: flagging the address would point them at the
  // wrong thing (DESIGN.md → Do's).
  const user = userEvent.setup();
  vi.spyOn(authApi, 'requestEmailChange').mockRejectedValue(
    new AuthError('Internal Server Error', 500),
  );

  render(<ChangeEmailSection />);
  await submit(user, 'moved@example.com', 'correct horse battery');

  expect(await screen.findByRole('alert')).toHaveTextContent(
    /couldn't complete that/i,
  );
  expect(screen.getByLabelText('Current password')).not.toHaveAttribute(
    'aria-invalid',
  );
});

it('reaches the form only with a signed-in account', () => {
  useAccountStore.setState({ user: null, status: 'ready' });

  const { container } = render(<ChangeEmailSection />);

  // The Account page gates its sections on the session; a signed-out one has no
  // address to change, and nothing here should pretend otherwise.
  expect(container).toBeEmptyDOMElement();
});
