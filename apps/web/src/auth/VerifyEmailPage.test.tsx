// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VerifyEmailPage } from './VerifyEmailPage';
import * as api from './api';
import { AuthError } from './api';
import { resetAccountStoreForTests, useAccountStore } from './account-store';
import { stubSystemTheme } from '../testing/match-media';

beforeEach(() => {
  resetAccountStoreForTests();
  sessionStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  stubSystemTheme('light');
  window.history.pushState({}, '', '/verify-email?token=t0ken');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('VerifyEmailPage', () => {
  it('spends the token from the link and signs the user in', async () => {
    const verifyEmail = vi
      .spyOn(api, 'verifyEmail')
      .mockResolvedValue({ email: 'ada@example.com', isAdmin: false });

    render(<VerifyEmailPage />);

    expect(
      await screen.findByRole('heading', { name: /address is verified/i }),
    ).toBeInTheDocument();
    // The token is spent over the API, never on load: a link scanner that
    // follows the URL in an inbox must not consume it.
    expect(verifyEmail).toHaveBeenCalledWith('t0ken');
    expect(useAccountStore.getState().user).toEqual({
      email: 'ada@example.com',
      isAdmin: false,
    });
  });

  it('offers a fresh link when the one it opened has expired', async () => {
    // Story 4: an expired link must not be a dead end.
    const user = userEvent.setup();
    vi.spyOn(api, 'verifyEmail').mockRejectedValue(
      new AuthError(
        'That verification link is no longer valid — it may have expired or already been used.',
        400,
        'link_invalid',
      ),
    );
    const resend = vi.spyOn(api, 'resendVerification').mockResolvedValue();
    render(<VerifyEmailPage />);

    expect(
      await screen.findByRole('heading', { name: /link has expired/i }),
    ).toBeInTheDocument();

    await user.type(
      screen.getByLabelText(/your email address/i),
      'ada@example.com',
    );
    await user.click(screen.getByRole('button', { name: /send a new link/i }));

    await waitFor(() => expect(resend).toHaveBeenCalledWith('ada@example.com'));
  });

  it('names a server failure without calling the link dead', async () => {
    vi.spyOn(api, 'verifyEmail').mockRejectedValue(
      new AuthError('Internal Server Error', 500),
    );
    render(<VerifyEmailPage />);

    expect(
      await screen.findByRole('heading', { name: /couldn’t verify/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      /the server couldn't complete that/i,
    );
  });

  it('says the link is incomplete when it carries no token', async () => {
    const verifyEmail = vi.spyOn(api, 'verifyEmail');
    window.history.pushState({}, '', '/verify-email');

    render(<VerifyEmailPage />);

    expect(
      await screen.findByRole('heading', { name: /link is incomplete/i }),
    ).toBeInTheDocument();
    expect(verifyEmail).not.toHaveBeenCalled();
  });

  it('spends the link once even when the effects run twice', async () => {
    // React's development double-mount (StrictMode, main.tsx) runs effects
    // twice. Without a guard the second pass spends a one-time link again and
    // the user watches a successful verification turn into "that link expired".
    const verifyEmail = vi
      .spyOn(api, 'verifyEmail')
      .mockResolvedValue({ email: 'ada@example.com', isAdmin: false });

    render(
      <StrictMode>
        <VerifyEmailPage />
      </StrictMode>,
    );

    expect(
      await screen.findByRole('heading', { name: /address is verified/i }),
    ).toBeInTheDocument();
    expect(verifyEmail).toHaveBeenCalledTimes(1);
  });

  it('takes the token out of the address bar before spending it', async () => {
    // A token is a bearer credential: in the URL it sits in this tab's history
    // and in any Referer the page goes on to send. It also means Back does not
    // re-spend it and tell a user who just verified that it expired.
    vi.spyOn(api, 'verifyEmail').mockResolvedValue({
      email: 'ada@example.com',
      isAdmin: false,
    });

    render(<VerifyEmailPage />);
    await screen.findByRole('heading', { name: /address is verified/i });

    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/verify-email');
  });

  it('returns to the editor from the verified state', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'verifyEmail').mockResolvedValue({
      email: 'ada@example.com',
      isAdmin: false,
    });

    render(<VerifyEmailPage />);
    await user.click(
      await screen.findByRole('button', { name: /open the editor/i }),
    );

    expect(window.location.pathname).toBe('/');
  });
});
