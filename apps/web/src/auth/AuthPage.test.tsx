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

  it('registers and returns to the editor', async () => {
    const user = userEvent.setup();
    const register = vi
      .spyOn(api, 'register')
      .mockResolvedValue({ email: 'a@b.co', isAdmin: false });
    render(<AuthPage mode="register" />);

    await user.type(screen.getByLabelText(/email/i), 'a@b.co');
    await user.type(
      screen.getByLabelText(/password/i),
      'correct horse battery',
    );
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(window.location.pathname).toBe('/'));
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

    // An admin reset can set a temp password shorter than the policy; login
    // must still accept it client-side.
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
  it('reveals the honest recovery path from the login form', async () => {
    const user = userEvent.setup();
    render(<AuthPage mode="login" />);

    const trigger = screen.getByRole('button', { name: /forgot password/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/ask the admin/i)).not.toBeInTheDocument();

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByText(/ask the admin/i);
    expect(trigger).toHaveAttribute('aria-controls', panel.id);

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/ask the admin/i)).not.toBeInTheDocument();
  });

  it('offers no recovery affordance on register', () => {
    render(<AuthPage mode="register" />);
    expect(
      screen.queryByRole('button', { name: /forgot password/i }),
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
