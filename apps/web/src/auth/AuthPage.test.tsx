// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthPage } from './AuthPage';
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
    expect(screen.getByRole('link', { name: /create one/i })).toHaveAttribute(
      'href',
      '/register',
    );
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
