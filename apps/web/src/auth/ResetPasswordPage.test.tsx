// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResetPasswordPage } from './ResetPasswordPage';
import * as api from './api';
import { AuthError } from './api';
import { stubSystemTheme } from '../testing/match-media';

beforeEach(() => {
  sessionStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  stubSystemTheme('light');
  window.history.pushState({}, '', '/reset-password');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ResetPasswordPage', () => {
  it('asks for a link and then names the address it went to', async () => {
    const user = userEvent.setup();
    const request = vi.spyOn(api, 'requestPasswordReset').mockResolvedValue();
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /send the link/i }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('ada@example.com'),
    );
    // Story 2's rule for this flow too: the user has to know which inbox to
    // open.
    expect(
      await screen.findByRole('heading', { name: /check your inbox/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });

  it('never says whether the address is registered', async () => {
    // Story 10: the answer is success-shaped, so the copy cannot claim an
    // account was found either.
    const user = userEvent.setup();
    vi.spyOn(api, 'requestPasswordReset').mockResolvedValue();
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText(/email/i), 'nobody@example.com');
    await user.click(screen.getByRole('button', { name: /send the link/i }));

    const sent = await screen.findByRole('heading', {
      name: /check your inbox/i,
    });
    const panel = sent.closest('div')!;
    expect(panel).toHaveTextContent(/if that address has/i);
    expect(panel).not.toHaveTextContent(/we (found|sent) an account/i);
  });

  it('names the link an unverified account receives instead', async () => {
    // Story 14: the mail is a verification link, and the page has to say so
    // rather than leave the user hunting for a reset link that is not there.
    const user = userEvent.setup();
    vi.spyOn(api, 'requestPasswordReset').mockResolvedValue();
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /send the link/i }));

    expect(
      await screen.findByRole('heading', { name: /check your inbox/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /never verified, the message is a verification link instead/i,
      ),
    ).toBeInTheDocument();
  });

  it('still names the address after a refresh', async () => {
    // A refresh is the likeliest thing between "Send the link" and reading the
    // inbox. Component state would go back to the form there, and a form looks
    // like nothing was sent (story 2).
    const user = userEvent.setup();
    vi.spyOn(api, 'requestPasswordReset').mockResolvedValue();
    const { unmount } = render(<ResetPasswordPage />);
    await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /send the link/i }));
    await screen.findByRole('heading', { name: /check your inbox/i });

    // Same tab, same URL, same storage — everything but the component's state.
    unmount();
    render(<ResetPasswordPage />);

    expect(
      screen.getByRole('heading', { name: /check your inbox/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });

  it('sends it again without the user retyping the address', async () => {
    // A link that never arrived must not be a dead end (the resend on the
    // verification flow is the same rule).
    const user = userEvent.setup();
    const request = vi.spyOn(api, 'requestPasswordReset').mockResolvedValue();
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /send the link/i }));
    await user.click(
      await screen.findByRole('button', { name: /send it again/i }),
    );

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });

  it('reports a rejected address with the server message', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'requestPasswordReset').mockRejectedValue(
      new AuthError('Enter a valid email address.', 400),
    );
    render(<ResetPasswordPage />);

    // Shape the browser accepts, shape the server refuses: a local part, an @,
    // and a domain with no dot.
    await user.type(screen.getByLabelText(/email/i), 'ada@example');
    await user.click(screen.getByRole('button', { name: /send the link/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /valid email address/i,
    );
    // The address was the problem, so the field says so; and it is still there
    // to be corrected.
    expect(screen.getByLabelText(/email/i)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText(/email/i)).toHaveValue('ada@example');
  });

  it('names a server failure without blaming the address', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'requestPasswordReset').mockRejectedValue(
      new AuthError('Internal Server Error', 500),
    );
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /send the link/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/the server couldn't complete that/i);
    expect(screen.getByLabelText(/email/i)).not.toHaveAttribute('aria-invalid');
  });

  it('names the recovery when the request never lands', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'requestPasswordReset').mockRejectedValue(
      new TypeError('Failed to fetch'),
    );
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /send the link/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /couldn't reach the server/i,
    );
  });

  it('offers the way back to sign in', () => {
    render(<ResetPasswordPage />);
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      '/login',
    );
  });
});
