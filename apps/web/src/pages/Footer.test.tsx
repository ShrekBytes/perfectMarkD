// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Footer } from './Footer';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('Footer', () => {
  it('states which build is running, so a bug report can name it', async () => {
    // The stamp is inlined at build time, so this drives the same variables CI
    // sets. Without this the suite would only ever see the unstamped fallback,
    // and a broken build arg would render `dev (local)` in production with
    // every test still green.
    vi.stubEnv('VITE_APP_VERSION', '0.1.0');
    vi.stubEnv('VITE_APP_COMMIT', 'abc1234');
    vi.resetModules();
    const { Footer: StampedFooter } = await import('./Footer');
    render(<StampedFooter />);
    expect(screen.getByText('0.1.0 (abc1234)')).toBeInTheDocument();
  });

  it('reports dev/local when the build stamped nothing in', () => {
    render(<Footer />);
    expect(screen.getByText('dev (local)')).toBeInTheDocument();
  });

  it('keeps the colophon and the site links', () => {
    render(<Footer />);
    expect(screen.getByRole('link', { name: 'AGPL-3.0' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Docs' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: 'Successor to the Advanced PDF Export plugin',
      }),
    ).toBeInTheDocument();
  });
});
