// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthPage } from './AuthPage';
import { AuthForm, type AuthMode } from './AuthForm';
import * as api from './api';
import { AuthError } from './api';
import { stubSystemTheme } from '../testing/match-media';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  stubSystemTheme('light');
  window.history.pushState({}, '', '/login');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('login mode', () => {
  it('renders the sign-in form', () => {
    render(<AuthPage mode="login" />);

    expect(
      screen.getByRole('heading', { name: /sign in/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /sign in/i }),
    ).toBeInTheDocument();
  });

  it('signs in and returns to the editor', async () => {
    const user = userEvent.setup();
    const login = vi
      .spyOn(api, 'login')
      .mockResolvedValue({ email: 'a@b.co', isAdmin: false });
    render(<AuthPage mode="login" />);

    await user.type(screen.getByLabelText(/email/i), 'a@b.co');
    await user.type(
      screen.getByLabelText(/password/i),
      'correct horse battery',
    );
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(login).toHaveBeenCalledTimes(1));
    expect(login).toHaveBeenCalledWith('a@b.co', 'correct horse battery');
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });

  it('shows the server error when credentials are rejected', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'login').mockRejectedValue(
      new AuthError('Incorrect email or password.', 401),
    );
    render(<AuthPage mode="login" />);

    await user.type(screen.getByLabelText(/email/i), 'a@b.co');
    await user.type(screen.getByLabelText(/password/i), 'nope');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Incorrect email or password.',
    );
    expect(window.location.pathname).toBe('/login');
  });

  it('explains an unverified address and offers a new link', async () => {
    // Story 3: a user who cannot get in must be told why, and given the way
    // out — not a generic failure.
    const user = userEvent.setup();
    vi.spyOn(api, 'login').mockRejectedValue(
      new AuthError(
        'Your email address is not verified yet.',
        403,
        'email_unverified',
      ),
    );
    const resend = vi.spyOn(api, 'resendVerification').mockResolvedValue();
    render(<AuthPage mode="login" />);

    await user.type(screen.getByLabelText(/email/i), 'a@b.co');
    await user.type(screen.getByLabelText(/password/i), 'correct horse');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByTestId('auth-unverified')).toHaveTextContent(
      /isn’t verified yet/i,
    );
    // The credentials were right, so no field is flagged as the problem.
    expect(screen.getByLabelText(/password/i)).not.toHaveAttribute(
      'aria-invalid',
    );

    await user.click(screen.getByRole('button', { name: /send a new link/i }));

    await waitFor(() => expect(resend).toHaveBeenCalledWith('a@b.co'));
  });
});

describe('register mode', () => {
  it('renders the create-account form', () => {
    render(<AuthPage mode="register" />);

    expect(
      screen.getByRole('heading', { name: /create account/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /create account/i }),
    ).toBeInTheDocument();
  });

  it('registers and sends the user to check their inbox', async () => {
    const user = userEvent.setup();
    const register = vi
      .spyOn(api, 'register')
      .mockResolvedValue({ email: 'a@b.co' });
    render(<AuthPage mode="register" />);

    await user.type(screen.getByLabelText(/email/i), 'a@b.co');
    await user.type(
      screen.getByLabelText(/password/i),
      'correct horse battery',
    );
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    // No session exists yet (email/02), so the editor is not where this goes.
    await waitFor(() => expect(window.location.pathname).toBe('/check-inbox'));
  });

  it('states the verification step before it happens', () => {
    render(<AuthPage mode="register" />);
    expect(screen.getByText(/one-time link/i)).toBeInTheDocument();
  });
});

describe('mode switch', () => {
  it('links to the other form', () => {
    render(<AuthPage mode="login" />);
    expect(
      screen.getByRole('link', { name: /create an account/i }),
    ).toHaveAttribute('href', '/register');
  });
});

describe('password policy hint', () => {
  it('enforces 8 characters on registration but not on login', () => {
    const { unmount } = render(<AuthPage mode="register" />);
    expect(screen.getByLabelText(/password/i)).toHaveAttribute(
      'minlength',
      '8',
    );
    unmount();

    // The 8-character rule belongs to registration and to choosing a new
    // password, not to sign-in: a client-side minimum here would pre-empt the
    // server's own answer with a bubble the user cannot act on.
    render(<AuthPage mode="login" />);
    expect(screen.getByLabelText(/password/i)).not.toHaveAttribute('minlength');
  });
});

describe('password policy hint (visible before submit)', () => {
  it('states the 8-character rule and wires it to the field on register', () => {
    render(<AuthPage mode="register" />);

    const password = screen.getByLabelText(/password/i);
    const hint = screen.getByText(/at least 8 characters/i);
    expect(password).toHaveAttribute(
      'aria-describedby',
      expect.stringContaining(hint.id),
    );
  });

  it('counts down while the password is short', async () => {
    const user = userEvent.setup();
    render(<AuthPage mode="register" />);

    await user.type(screen.getByLabelText(/password/i), 'abc');
    expect(
      screen.getByText(/at least 8 characters — 5 more needed/i),
    ).toBeInTheDocument();
  });

  it('shows no policy hint on login', () => {
    render(<AuthPage mode="login" />);
    expect(
      screen.queryByText(/at least 8 characters/i),
    ).not.toBeInTheDocument();
  });

  it('announces the countdown as it changes', async () => {
    const user = userEvent.setup();
    render(<AuthPage mode="register" />);

    const hint = screen.getByText(/at least 8 characters/i);
    expect(hint).toHaveAttribute('role', 'status');

    await user.type(screen.getByLabelText(/password/i), 'abc');
    expect(screen.getByText(/5 more needed/i)).toHaveAttribute(
      'role',
      'status',
    );
  });
});

describe('error recovery', () => {
  it('marks the fields invalid on a rejected credential', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'login').mockRejectedValue(
      new AuthError('Incorrect email or password.', 401),
    );
    render(<AuthPage mode="login" />);

    await user.type(screen.getByLabelText(/email/i), 'a@b.co');
    await user.type(screen.getByLabelText(/password/i), 'nope');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    const alert = await screen.findByRole('alert');
    expect(screen.getByLabelText(/email/i)).toHaveAttribute(
      'aria-describedby',
      expect.stringContaining(alert.id),
    );
    expect(screen.getByLabelText(/email/i)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText(/password/i)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('names the connection recovery when the request never lands', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'login').mockRejectedValue(new TypeError('Failed to fetch'));
    render(<AuthPage mode="login" />);

    await user.type(screen.getByLabelText(/email/i), 'a@b.co');
    await user.type(screen.getByLabelText(/password/i), 'nope');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /couldn't reach the server/i,
    );
    // A network failure is not the user's input — no field is flagged.
    expect(screen.getByLabelText(/email/i)).not.toHaveAttribute('aria-invalid');
  });

  it('replaces a vague server failure with a recoverable message', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'login').mockRejectedValue(
      new AuthError('Something went wrong.', 500),
    );
    render(<AuthPage mode="login" />);

    await user.type(screen.getByLabelText(/email/i), 'a@b.co');
    await user.type(screen.getByLabelText(/password/i), 'nope');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /the server couldn't complete that/i,
    );
  });

  it('does not flag the fields when the server body is unreadable', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Bad Gateway', { status: 400 })),
    );
    render(<AuthPage mode="login" />);

    await user.type(screen.getByLabelText(/email/i), 'a@b.co');
    await user.type(screen.getByLabelText(/password/i), 'nope');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /the server couldn't complete that/i,
    );
    // An unreadable body is not the user's input — no field is flagged.
    expect(screen.getByLabelText(/email/i)).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText(/password/i)).not.toHaveAttribute(
      'aria-invalid',
    );
  });

  it('treats a body with a code but no error as the fallback too', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 'nope' }), { status: 400 }),
      ),
    );
    render(<AuthPage mode="login" />);

    await user.type(screen.getByLabelText(/email/i), 'a@b.co');
    await user.type(screen.getByLabelText(/password/i), 'nope');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /the server couldn't complete that/i,
    );
    // The fallback marker travels with the fallback message — no field flag.
    expect(screen.getByLabelText(/email/i)).not.toHaveAttribute('aria-invalid');
  });
});

describe('forgot password', () => {
  it('leads to the reset request page', async () => {
    // Story 9: self-service recovery, one click from the form a user is stuck
    // on. (It used to be a disclosure that named the Admin as the only way in.)
    const user = userEvent.setup();
    render(<AuthPage mode="login" />);

    await user.click(screen.getByRole('link', { name: /forgot password/i }));

    await waitFor(() =>
      expect(window.location.pathname).toBe('/reset-password'),
    );
  });

  it('offers no recovery affordance on register', () => {
    render(<AuthPage mode="register" />);
    expect(
      screen.queryByRole('link', { name: /forgot password/i }),
    ).not.toBeInTheDocument();
  });
});

describe('Google Sign-In', () => {
  it('offers the button on both auth pages when the server advertises it', async () => {
    vi.spyOn(api, 'signInProviders').mockResolvedValue({ google: true });

    const { unmount } = render(<AuthPage mode="login" />);
    expect(
      await screen.findByRole('link', { name: /continue with google/i }),
    ).toHaveAttribute('href', '/auth/google/start');
    unmount();

    render(<AuthPage mode="register" />);
    expect(
      await screen.findByRole('link', { name: /continue with google/i }),
    ).toBeInTheDocument();
  });

  it('leaves the page untouched on a deployment without it', async () => {
    // Story 8: no option that leads nowhere — the page is exactly what it was.
    vi.spyOn(api, 'signInProviders').mockResolvedValue({ google: false });

    render(<AuthPage mode="login" />);

    await waitFor(() => expect(api.signInProviders).toHaveBeenCalled());
    expect(
      screen.queryByRole('link', { name: /continue with google/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('auth-form')).toBeInTheDocument();
  });

  it('answers a failed Google leg inline, with the password form intact', async () => {
    // Story 9: the callback redirected back with its code (google-signin/01), and
    // a user whose Google leg failed keeps their place.
    window.history.pushState({}, '', '/login?google=declined');
    vi.spyOn(api, 'signInProviders').mockResolvedValue({ google: true });

    render(<AuthPage mode="login" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /closed the consent screen/i,
    );
    // The way in that always works is still right there, typed into or not.
    expect(screen.getByTestId('auth-form')).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('says nothing about Google when the page did not come from a callback', async () => {
    vi.spyOn(api, 'signInProviders').mockResolvedValue({ google: true });

    render(<AuthPage mode="login" />);

    // Wait for the block to arrive first: an assertion made before the check
    // settles would pass whether or not the notice ever rendered.
    await screen.findByRole('link', { name: /continue with google/i });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('google-sign-in-failure'),
    ).not.toBeInTheDocument();
  });
});

describe('mode switch in place', () => {
  function Switching() {
    const [mode, setMode] = useState<AuthMode>('login');
    return (
      <AuthForm
        mode={mode}
        onAuthenticated={() => {}}
        onRegistered={() => {}}
        onSwitchMode={() =>
          setMode((current) => (current === 'login' ? 'register' : 'login'))
        }
      />
    );
  }

  it('does not carry a failure into the other form', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'login').mockRejectedValue(
      new AuthError('Incorrect email or password.', 401),
    );
    render(<Switching />);

    await user.type(screen.getByLabelText(/email/i), 'a@b.co');
    await user.type(screen.getByLabelText(/password/i), 'nope');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /create an account/i }),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('preserves typed input across the mode switch', async () => {
    const user = userEvent.setup();
    render(<Switching />);

    await user.type(screen.getByLabelText(/email/i), 'a@b.co');
    await user.type(screen.getByLabelText(/password/i), 'correct horse');

    await user.click(
      screen.getByRole('button', { name: /create an account/i }),
    );
    expect(screen.getByLabelText(/email/i)).toHaveValue('a@b.co');
    expect(screen.getByLabelText(/password/i)).toHaveValue('correct horse');

    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(screen.getByLabelText(/email/i)).toHaveValue('a@b.co');
    expect(screen.getByLabelText(/password/i)).toHaveValue('correct horse');
  });
});
