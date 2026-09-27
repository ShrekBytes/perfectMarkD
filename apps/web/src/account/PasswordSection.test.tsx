// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PasswordSection } from './PasswordSection';
import * as authApi from '../auth/api';
import { AuthError, type SignInMethods } from '../auth/api';
import {
  resetAccountStoreForTests,
  useAccountStore,
} from '../auth/account-store';

/** An account as /api/me reports it (google-signin/01b): the sign-in methods
 *  are what decide which form this section renders. */
function signedInAs(signIn: SignInMethods) {
  resetAccountStoreForTests();
  useAccountStore.setState({
    user: { email: 'reader@example.com', isAdmin: false },
    status: 'ready',
    signIn,
  });
}

beforeEach(() => {
  signedInAs({ password: true, google: false });
});

afterEach(() => {
  cleanup();
  resetAccountStoreForTests();
  vi.restoreAllMocks();
});

it('gives an account with a password the change-password form and says so', () => {
  render(<PasswordSection />);

  expect(screen.getByTestId('account-signin-methods')).toHaveTextContent(
    /^Password — the one you set here\.$/,
  );
  expect(screen.getByTestId('change-password-form')).toBeInTheDocument();
  // Set Password is for an account that has none, and this one has one.
  expect(screen.queryByTestId('set-password-form')).not.toBeInTheDocument();
});

it('gives a Google-registered account the set-password form', () => {
  signedInAs({ password: false, google: true });

  render(<PasswordSection />);

  expect(screen.getByTestId('account-signin-methods')).toHaveTextContent(
    /no password of its own yet/i,
  );
  expect(
    screen.getByRole('heading', { name: 'Set password' }),
  ).toBeInTheDocument();
  // Change Password asks for a current password this account has never had.
  expect(screen.queryByTestId('change-password-form')).not.toBeInTheDocument();
});

it('an account with both sign-in methods gets the change-password form', () => {
  signedInAs({ password: true, google: true });

  render(<PasswordSection />);

  expect(screen.getByTestId('account-signin-methods')).toHaveTextContent(
    /Password and Google — either one signs you in/,
  );
  expect(screen.getByTestId('change-password-form')).toBeInTheDocument();
  expect(screen.queryByTestId('set-password-form')).not.toBeInTheDocument();
});

it('states no method before the server has reported one, and keeps the ordinary form', () => {
  signedInAs({ password: true, google: false });
  useAccountStore.setState({ signIn: null });

  render(<PasswordSection />);

  // An unreported block is not a claim that the account has no password.
  expect(
    screen.queryByTestId('account-signin-methods'),
  ).not.toBeInTheDocument();
  expect(screen.getByTestId('change-password-form')).toBeInTheDocument();
});

it('sets the first password, then shows the change-password form and confirms it', async () => {
  // google-signin/01b, through the store: the write is what makes the account
  // have a password, so the page swaps forms and says what happened.
  const user = userEvent.setup();
  signedInAs({ password: false, google: true });
  const setPassword = vi
    .spyOn(authApi, 'setPassword')
    .mockResolvedValue(undefined);

  render(<PasswordSection />);
  await user.type(screen.getByLabelText('New password'), 'a-brand-new-one');
  await user.type(
    screen.getByLabelText('Confirm new password'),
    'a-brand-new-one',
  );
  await user.click(screen.getByRole('button', { name: 'Set password' }));

  await waitFor(() => expect(setPassword).toHaveBeenCalledTimes(1));
  expect(setPassword).toHaveBeenCalledWith('a-brand-new-one');
  expect(await screen.findByTestId('set-password-success')).toHaveTextContent(
    /other signed-in devices were signed out/i,
  );
  // The account has a password now, so the ordinary form replaces this one.
  expect(screen.getByTestId('change-password-form')).toBeInTheDocument();
  expect(screen.queryByTestId('set-password-form')).not.toBeInTheDocument();
  // And the line agrees with it: both methods, no Google identity lost.
  expect(screen.getByTestId('account-signin-methods')).toHaveTextContent(
    /Password and Google/,
  );
  expect(useAccountStore.getState().signIn).toEqual({
    password: true,
    google: true,
  });
});

it('gives inline feedback for a too-short or mismatched password, without a round trip', async () => {
  const user = userEvent.setup();
  signedInAs({ password: false, google: true });
  const setPassword = vi.spyOn(authApi, 'setPassword');

  render(<PasswordSection />);
  await user.type(screen.getByLabelText('New password'), 'short');
  await user.type(screen.getByLabelText('Confirm new password'), 'other');
  await user.click(screen.getByRole('button', { name: 'Set password' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    /at least 8 characters/i,
  );
  expect(setPassword).not.toHaveBeenCalled();

  await user.clear(screen.getByLabelText('New password'));
  await user.type(screen.getByLabelText('New password'), 'a-long-enough-one');
  await user.click(screen.getByRole('button', { name: 'Set password' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/don’t match/i);
  expect(setPassword).not.toHaveBeenCalled();
});

it('hands the confirmation to Change Password rather than stacking on it', async () => {
  // Both outcomes say the same thing about other devices; saying it twice, once
  // for a set and once for a change, reads as two separate events.
  const user = userEvent.setup();
  signedInAs({ password: false, google: true });
  vi.spyOn(authApi, 'setPassword').mockResolvedValue(undefined);
  const changePassword = vi
    .spyOn(authApi, 'changePassword')
    .mockResolvedValue(undefined);

  render(<PasswordSection />);
  await user.type(screen.getByLabelText('New password'), 'a-brand-new-one');
  await user.type(
    screen.getByLabelText('Confirm new password'),
    'a-brand-new-one',
  );
  await user.click(screen.getByRole('button', { name: 'Set password' }));
  await screen.findByTestId('set-password-success');

  await user.type(
    within(screen.getByTestId('change-password-form')).getByLabelText(
      'Current password',
    ),
    'a-brand-new-one',
  );
  await user.type(screen.getByLabelText('New password'), 'another-one-x');
  await user.type(
    screen.getByLabelText('Confirm new password'),
    'another-one-x',
  );
  await user.click(screen.getByRole('button', { name: 'Change password' }));

  await screen.findByTestId('change-password-success');
  expect(changePassword).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('set-password-success')).not.toBeInTheDocument();
});

it('shows the server’s refusal when the account turns out to have a password', async () => {
  // The race /api/me could not have caught: two requests, one account. The
  // write is refused, so the section stays and says what the server said.
  const user = userEvent.setup();
  signedInAs({ password: false, google: true });
  vi.spyOn(authApi, 'setPassword').mockRejectedValue(
    new AuthError(
      'This account already has a password. Change it instead.',
      409,
    ),
  );

  render(<PasswordSection />);
  await user.type(screen.getByLabelText('New password'), 'a-brand-new-one');
  await user.type(
    screen.getByLabelText('Confirm new password'),
    'a-brand-new-one',
  );
  await user.click(screen.getByRole('button', { name: 'Set password' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    /already has a password/i,
  );
  expect(screen.getByTestId('set-password-form')).toBeInTheDocument();
});
