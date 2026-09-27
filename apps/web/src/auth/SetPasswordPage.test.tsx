// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SetPasswordPage } from './SetPasswordPage';
import * as api from './api';
import { AuthError } from './api';
import { stubSystemTheme } from '../testing/match-media';

beforeEach(() => {
  sessionStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  stubSystemTheme('light');
  window.history.pushState({}, '', '/set-password?token=t0ken');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Fills the two fields the way a user does, and submits. */
async function choosePassword(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText(/^new password$/i),
    'a brand new password',
  );
  await user.type(
    screen.getByLabelText(/confirm new password/i),
    'a brand new password',
  );
  await user.click(screen.getByRole('button', { name: /set password/i }));
}

describe('SetPasswordPage', () => {
  it('spends the link from the address bar with the new password', async () => {
    // Story 11: regain access with credentials only I know.
    const user = userEvent.setup();
    const resetPassword = vi.spyOn(api, 'resetPassword').mockResolvedValue();
    render(<SetPasswordPage />);

    await choosePassword(user);

    await waitFor(() =>
      expect(resetPassword).toHaveBeenCalledWith(
        't0ken',
        'a brand new password',
      ),
    );
    expect(
      await screen.findByRole('heading', { name: /password is set/i }),
    ).toBeInTheDocument();
  });

  it('says every device was signed out, and sends the user to sign in', async () => {
    // Story 12, stated where it happens: the recovery ended the other sessions
    // because the user has to sign in again.
    const user = userEvent.setup();
    vi.spyOn(api, 'resetPassword').mockResolvedValue();
    render(<SetPasswordPage />);

    await choosePassword(user);

    expect(
      await screen.findByRole('heading', { name: /password is set/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/signed out/i)).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /^sign in$/i }));
    expect(window.location.pathname).toBe('/login');
  });

  it('offers the expired-link state a fresh request when the link is dead', async () => {
    // The ticket's own case: the one-time link is spent, expired, or mistyped.
    const user = userEvent.setup();
    vi.spyOn(api, 'resetPassword').mockRejectedValue(
      new AuthError(
        'That link is no longer valid — it may have expired or already been used.',
        400,
        'link_invalid',
      ),
    );
    render(<SetPasswordPage />);

    await choosePassword(user);

    expect(
      await screen.findByRole('heading', { name: /link has expired/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /request a new link/i }),
    ).toHaveAttribute('href', '/reset-password');
  });

  it('refuses a password under the policy without spending the link', async () => {
    const user = userEvent.setup();
    const resetPassword = vi.spyOn(api, 'resetPassword');
    render(<SetPasswordPage />);

    await user.type(screen.getByLabelText(/^new password$/i), 'short');
    await user.type(screen.getByLabelText(/confirm new password/i), 'short');
    await user.click(screen.getByRole('button', { name: /set password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /at least 8 characters/i,
    );
    // A link is often a user's only way in; a typo must not burn it.
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('flags the fields for a password the server refuses', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'resetPassword').mockRejectedValue(
      new AuthError('New password must be at least 8 characters.', 400),
    );
    render(<SetPasswordPage />);

    await choosePassword(user);

    await screen.findByRole('alert');
    expect(screen.getByLabelText(/^new password$/i)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('refuses a confirmation that does not match, and flags both fields', async () => {
    const user = userEvent.setup();
    const resetPassword = vi.spyOn(api, 'resetPassword');
    render(<SetPasswordPage />);

    await user.type(
      screen.getByLabelText(/^new password$/i),
      'a brand new password',
    );
    await user.type(
      screen.getByLabelText(/confirm new password/i),
      'something else entirely',
    );
    await user.click(screen.getByRole('button', { name: /set password/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/don’t match/i);
    expect(resetPassword).not.toHaveBeenCalled();
    // A mismatch is about both fields, so both point at the message — flagging
    // one of them reads as "that one is wrong".
    for (const field of [
      screen.getByLabelText(/^new password$/i),
      screen.getByLabelText(/confirm new password/i),
    ]) {
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(field).toHaveAttribute(
        'aria-describedby',
        expect.stringContaining(alert.id),
      );
    }
  });

  it('names a server failure without flagging the field', async () => {
    // DESIGN.md → Do's: a 5xx is ours, not the user's, so no field is marked.
    const user = userEvent.setup();
    vi.spyOn(api, 'resetPassword').mockRejectedValue(
      new AuthError('Internal Server Error', 500),
    );
    render(<SetPasswordPage />);

    await choosePassword(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /the server couldn't complete that/i,
    );
    expect(
      screen.getByRole('heading', { name: /choose a new password/i }),
    ).toBeInTheDocument();
    // The form stays, one click from a retry, with what the user typed.
    expect(
      screen.queryByRole('heading', { name: /link has expired/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^new password$/i)).not.toHaveAttribute(
      'aria-invalid',
    );
  });

  it('says the link is incomplete when it carries no token', async () => {
    const resetPassword = vi.spyOn(api, 'resetPassword');
    window.history.pushState({}, '', '/set-password');

    render(<SetPasswordPage />);

    expect(
      await screen.findByRole('heading', { name: /link is incomplete/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /request a new link/i }),
    ).toHaveAttribute('href', '/reset-password');
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('takes the token out of the address bar before spending it', async () => {
    // A token is a bearer credential: in the URL it sits in this tab's history
    // and in any Referer the page goes on to send. (email/02 paid for learning
    // this the hard way on the verification page.)
    const user = userEvent.setup();
    vi.spyOn(api, 'resetPassword').mockResolvedValue();
    render(<SetPasswordPage />);

    await choosePassword(user);

    await waitFor(() => expect(window.location.search).toBe(''));
    expect(window.location.pathname).toBe('/set-password');
  });

  it('spends the link once under StrictMode, and once per submit', async () => {
    // The set form renders once, but React's development double-mount runs its
    // effects twice — so the token must be read once, not per effect run.
    const user = userEvent.setup();
    const resetPassword = vi.spyOn(api, 'resetPassword').mockResolvedValue();

    render(
      <StrictMode>
        <SetPasswordPage />
      </StrictMode>,
    );
    await choosePassword(user);

    await waitFor(() => expect(resetPassword).toHaveBeenCalledTimes(1));
  });
});
