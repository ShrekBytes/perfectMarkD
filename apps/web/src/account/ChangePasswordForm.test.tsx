// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ChangePasswordForm } from './ChangePasswordForm';
import * as authApi from '../auth/api';
import { AuthError } from '../auth/api';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('calls the existing change-password client with the entered passwords', async () => {
  const user = userEvent.setup();
  const spy = vi.spyOn(authApi, 'changePassword').mockResolvedValue(undefined);

  render(<ChangePasswordForm />);
  await user.type(screen.getByLabelText('Current password'), 'old-password-1');
  await user.type(screen.getByLabelText('New password'), 'new-password-1');
  await user.type(
    screen.getByLabelText('Confirm new password'),
    'new-password-1',
  );
  await user.click(screen.getByRole('button', { name: 'Change password' }));

  await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  expect(spy).toHaveBeenCalledWith('old-password-1', 'new-password-1');
  // Clear confirmation, and the fields clear for the next time.
  expect(
    await screen.findByTestId('change-password-success'),
  ).toHaveTextContent('Your password has been changed.');
  expect(screen.getByLabelText('Current password')).toHaveValue('');
  expect(screen.getByLabelText('New password')).toHaveValue('');
  expect(screen.getByLabelText('Confirm new password')).toHaveValue('');
});

it('gives inline feedback for a too-short new password without a round trip', async () => {
  const user = userEvent.setup();
  const spy = vi.spyOn(authApi, 'changePassword').mockResolvedValue(undefined);

  render(<ChangePasswordForm />);
  await user.type(screen.getByLabelText('Current password'), 'old-password-1');
  await user.type(screen.getByLabelText('New password'), 'short');
  await user.type(screen.getByLabelText('Confirm new password'), 'short');
  await user.click(screen.getByRole('button', { name: 'Change password' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    /at least 8 characters/i,
  );
  expect(spy).not.toHaveBeenCalled();
});

it('gives inline feedback when the confirm field does not match', async () => {
  const user = userEvent.setup();
  const spy = vi.spyOn(authApi, 'changePassword').mockResolvedValue(undefined);

  render(<ChangePasswordForm />);
  await user.type(screen.getByLabelText('Current password'), 'old-password-1');
  await user.type(screen.getByLabelText('New password'), 'new-password-1');
  await user.type(screen.getByLabelText('Confirm new password'), 'different-1');
  await user.click(screen.getByRole('button', { name: 'Change password' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/don’t match/i);
  expect(spy).not.toHaveBeenCalled();
});

it('gives inline feedback when the current password is wrong', async () => {
  const user = userEvent.setup();
  const spy = vi
    .spyOn(authApi, 'changePassword')
    .mockRejectedValue(new AuthError('Current password is incorrect.', 401));

  render(<ChangePasswordForm />);
  await user.type(screen.getByLabelText('Current password'), 'wrong-pass');
  await user.type(screen.getByLabelText('New password'), 'new-password-1');
  await user.type(
    screen.getByLabelText('Confirm new password'),
    'new-password-1',
  );
  await user.click(screen.getByRole('button', { name: 'Change password' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    /current password is incorrect/i,
  );
  // The fields keep their values — the user corrects and retries.
  expect(screen.getByLabelText('Current password')).toHaveValue('wrong-pass');
  expect(spy).toHaveBeenCalledTimes(1);
});
