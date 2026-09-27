// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmEmailChangePage } from './ConfirmEmailChangePage';
import * as api from './api';
import { AuthError } from './api';
import { resetAccountStoreForTests, useAccountStore } from './account-store';
import { stubSystemTheme } from '../testing/match-media';

const CHANGED = { email: 'moved@example.com', isAdmin: false };

beforeEach(() => {
  resetAccountStoreForTests();
  document.documentElement.removeAttribute('data-theme');
  stubSystemTheme('light');
  window.history.pushState({}, '', '/confirm-email-change?token=t0ken');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ConfirmEmailChangePage', () => {
  it('spends the token from the link and names the address it moved to', async () => {
    const confirm = vi
      .spyOn(api, 'confirmEmailChange')
      .mockResolvedValue(CHANGED);
    const refresh = vi.fn();
    useAccountStore.setState({ refresh, status: 'ready' });

    render(<ConfirmEmailChangePage />);

    expect(
      await screen.findByRole('heading', { name: /login email changed/i }),
    ).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledWith('t0ken');
    // Which address the account uses now — the whole answer to the question the
    // user opened the link with.
    expect(screen.getByTestId('changed-email')).toHaveTextContent(
      'moved@example.com',
    );
    // The account is signed in somewhere in this tab or another, and what it
    // shows about who is signed in is now stale.
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('takes the token out of the address bar before spending it', async () => {
    // A token is a bearer credential: in the URL it sits in this tab's history
    // and in any Referer the page goes on to send.
    vi.spyOn(api, 'confirmEmailChange').mockResolvedValue(CHANGED);

    render(<ConfirmEmailChangePage />);
    await screen.findByRole('heading', { name: /login email changed/i });

    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/confirm-email-change');
  });

  it('spends the link once even when the effects run twice', async () => {
    // React's development double-mount (StrictMode, main.tsx) runs effects
    // twice. Without a guard the second pass spends a one-time link again and
    // the user watches a change that worked turn into "that link expired".
    const confirm = vi
      .spyOn(api, 'confirmEmailChange')
      .mockResolvedValue(CHANGED);

    render(
      <StrictMode>
        <ConfirmEmailChangePage />
      </StrictMode>,
    );

    expect(
      await screen.findByRole('heading', { name: /login email changed/i }),
    ).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('sends a dead link back to the Account page to ask for another', async () => {
    vi.spyOn(api, 'confirmEmailChange').mockRejectedValue(
      new AuthError(
        'That link is no longer valid — it may have expired or already been used.',
        400,
        'link_invalid',
      ),
    );

    render(<ConfirmEmailChangePage />);

    expect(
      await screen.findByRole('heading', { name: /link has expired/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /ask for a new link/i }),
    ).toHaveAttribute('href', '/account');
  });

  it('names a taken address as a taken address, not a dead link', async () => {
    // Two different answers because the recoveries differ: a dead link needs a
    // fresh one, a taken address needs a different address.
    vi.spyOn(api, 'confirmEmailChange').mockRejectedValue(
      new AuthError(
        'That address is already used by another account. Ask for a new link from the Account page with a different address.',
        409,
        'email_taken',
      ),
    );

    render(<ConfirmEmailChangePage />);

    expect(
      await screen.findByRole('heading', { name: /already in use/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      /already used by another account/i,
    );
    expect(
      screen.getByRole('link', { name: /try another address/i }),
    ).toHaveAttribute('href', '/account');
  });

  it('names a server failure without calling the link dead', async () => {
    vi.spyOn(api, 'confirmEmailChange').mockRejectedValue(
      new AuthError('Internal Server Error', 500),
    );

    render(<ConfirmEmailChangePage />);

    expect(
      await screen.findByRole('heading', { name: /couldn’t confirm/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      /the server couldn't complete that/i,
    );
  });

  it('says the link is incomplete when it carries no token', async () => {
    const confirm = vi.spyOn(api, 'confirmEmailChange');
    window.history.pushState({}, '', '/confirm-email-change');

    render(<ConfirmEmailChangePage />);

    expect(
      await screen.findByRole('heading', { name: /link is incomplete/i }),
    ).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('returns to the Account page from the changed state', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'confirmEmailChange').mockResolvedValue(CHANGED);

    render(<ConfirmEmailChangePage />);
    await user.click(
      await screen.findByRole('link', { name: /back to your account/i }),
    );

    expect(window.location.pathname).toBe('/account');
  });
});
