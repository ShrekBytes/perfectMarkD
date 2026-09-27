// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckInboxPage } from './CheckInboxPage';
import { rememberVerificationEmail } from './pending-email';
import * as api from './api';
import { stubSystemTheme } from '../testing/match-media';

beforeEach(() => {
  sessionStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  stubSystemTheme('light');
  window.history.pushState({}, '', '/check-inbox');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('CheckInboxPage', () => {
  it('names the address the link went to', () => {
    rememberVerificationEmail('ada@example.com');

    render(<CheckInboxPage />);

    // Story 2: the user has to know which inbox to open.
    expect(
      screen.getByRole('heading', { name: /check your inbox/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText(/sign-in stays locked/i)).toBeInTheDocument();
  });

  it('still says what to do when this tab has no address to name', () => {
    render(<CheckInboxPage />);

    expect(
      screen.getByText(/the address you registered with/i),
    ).toBeInTheDocument();
  });

  it('resends the link to the address it knows, and says it was sent', async () => {
    const user = userEvent.setup();
    rememberVerificationEmail('ada@example.com');
    const resend = vi.spyOn(api, 'resendVerification').mockResolvedValue();
    render(<CheckInboxPage />);

    // Story 5: a lost email must not lock anyone out.
    await user.click(screen.getByRole('button', { name: /send a new link/i }));

    await waitFor(() => expect(resend).toHaveBeenCalledWith('ada@example.com'));
    expect(await screen.findByRole('status')).toHaveTextContent(/sent/i);
  });

  it('asks for the address before it can resend', async () => {
    const user = userEvent.setup();
    const resend = vi.spyOn(api, 'resendVerification').mockResolvedValue();
    render(<CheckInboxPage />);

    await user.type(
      screen.getByLabelText(/your email address/i),
      'ada@example.com',
    );
    await user.click(screen.getByRole('button', { name: /send a new link/i }));

    await waitFor(() => expect(resend).toHaveBeenCalledWith('ada@example.com'));
  });

  it('reports a resend that did not land', async () => {
    const user = userEvent.setup();
    rememberVerificationEmail('ada@example.com');
    vi.spyOn(api, 'resendVerification').mockRejectedValue(
      new TypeError('Failed to fetch'),
    );
    render(<CheckInboxPage />);

    await user.click(screen.getByRole('button', { name: /send a new link/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /couldn't reach the server/i,
    );
  });

  it('offers the way back to sign in', () => {
    render(<CheckInboxPage />);
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      '/login',
    );
  });
});
