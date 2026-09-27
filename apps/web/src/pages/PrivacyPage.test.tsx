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

  it('discloses what Google Sign-In sends and what is kept', () => {
    render(<PrivacyPage />);

    const google = screen.getByRole('region', { name: 'Google Sign-In' });
    // What the consent screen asks for (story 14), what is stored, and what
    // arrives and is dropped: the identity is the only import (spec §Out of
    // Scope), and the server keeps exactly the two fields the paragraph names.
    expect(google).toHaveTextContent(/name, email address, and basic profile/i);
    expect(google).toHaveTextContent(
      /we keep two things: the address[\s\S]*your Google account id/i,
    );
    expect(google).toHaveTextContent(
      /Your name, your contacts, your files, and your profile picture are not kept/i,
    );
  });

  it('scopes the Google round trip as a navigation the user starts, not a page load', () => {
    // ADR-0010: the no-third-party-loads claim is about what a page loads, and
    // the sign-in redirect is not one of its exceptions — the disclosure has to
    // say so itself rather than leave the reader to reconcile the two.
    render(<PrivacyPage />);

    const google = screen.getByRole('region', { name: 'Google Sign-In' });
    expect(google).toHaveTextContent(
      /a page you asked to go to, not this site loading anything from Google/i,
    );
    // The claim itself is unchanged: an AI Action is still its one exception.
    const claim = screen.getByText(/no page here loads anything from/i);
    expect(claim).toHaveTextContent(/AI Action/i);
  });

  it('says Google is optional, and never the only way in', () => {
    // Stories 5–7: a password can be set later, and Password Reset is the
    // recovery whatever the account signed in with.
    render(<PrivacyPage />);

    const google = screen.getByRole('region', { name: 'Google Sign-In' });
    expect(google).toHaveTextContent(/It is optional/i);
    expect(google).toHaveTextContent(/set a password on your Account page/i);
    expect(google).toHaveTextContent(/Google is never the only way in/i);
    expect(google).toHaveTextContent(/password reset on the sign-in page/i);
  });

  it('covers an instance that has not set Google Sign-In up', () => {
    // Self-Hosted Instances are never forced into Google Cloud setup (story 12).
    render(<PrivacyPage />);

    expect(
      screen.getByRole('region', { name: 'Google Sign-In' }),
    ).toHaveTextContent(/never shows the button at all/i);
  });
});
