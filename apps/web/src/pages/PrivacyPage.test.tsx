// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrivacyPage } from './PrivacyPage';
import { stubSystemTheme } from '../testing/match-media';

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  stubSystemTheme('light');
  window.history.pushState({}, '', '/privacy');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * The page makes factual claims about where data goes, and launch/06 verifies
 * that the copy matches the deployment rather than the other way round. These
 * pin the two claims that are easy to break by editing prose: the third-party
 * exception, and the Cloudflare edge the tunnel puts in the request path
 * (ADR-0010). A rewrite that quietly drops the second would make the page
 * wrong again, and nothing else would catch it.
 */
describe('PrivacyPage', () => {
  it('names Cloudflare as infrastructure in the request path', () => {
    render(<PrivacyPage />);

    const tunnel = screen.getByText(/Cloudflare Tunnel/);
    expect(tunnel).toBeInTheDocument();
    // Not left to read as tracking: the page says what it is not used for.
    expect(tunnel).toHaveTextContent(/not an analytics or tracking service/i);
    // And it says the Document rides the same path, not just the request.
    expect(tunnel).toHaveTextContent(/Server Export/);
  });

  it('keeps the no-third-party claim scoped to what the app itself loads', () => {
    render(<PrivacyPage />);

    const claim = screen.getByText(/no page here loads anything from/i);
    // The exception stays the one it was: an AI Action the user submits.
    expect(claim).toHaveTextContent(/AI Action/i);
    // Email is a server-side handoff, not a page load, so it must not be listed
    // as an exception to this claim — the page separates the two instead.
    expect(claim).not.toHaveTextContent(/two deliberate exceptions/i);
    expect(claim).toHaveTextContent(/never a page loading anything/i);
  });

  it('still tells the user AI Actions are the one place text leaves the browser', () => {
    render(<PrivacyPage />);

    expect(
      screen.getByText(/the one place where your text leaves your browser/i),
    ).toBeInTheDocument();
  });

  it('says exactly what an email carries: the address, the link, nothing else', () => {
    render(<PrivacyPage />);

    const email = screen.getByRole('region', { name: 'Email' });
    expect(email).toHaveTextContent(/your address, a one-time link/i);
    // ADR-0013's load-bearing promise, stated where email is described.
    expect(email).toHaveTextContent(/never any part of a Document/i);
    // And the provider is named, with its retention called the provider's.
    expect(email).toHaveTextContent(/Resend/);
    expect(email).toHaveTextContent(/is Resend's policy, not ours/i);
  });

  it('tells the user a link cannot be replayed from a copy of the database', () => {
    render(<PrivacyPage />);

    const email = screen.getByRole('region', { name: 'Email' });
    expect(email).toHaveTextContent(/a hash of each link/i);
    expect(email).toHaveTextContent(/links work once, they expire/i);
  });
});
