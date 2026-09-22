// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Link, navigate, routeForPath, useRoute } from './router';

function RouteProbe() {
  const route = useRoute();
  return <span data-testid="route">{route}</span>;
}

beforeEach(() => {
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  cleanup();
});

describe('routeForPath', () => {
  it('maps known paths, with the editor at /', () => {
    expect(routeForPath('/pricing')).toBe('pricing');
    expect(routeForPath('/account')).toBe('account');
    expect(routeForPath('/login')).toBe('login');
    expect(routeForPath('/register')).toBe('register');
    expect(routeForPath('/admin')).toBe('admin');
    expect(routeForPath('/about')).toBe('about');
    expect(routeForPath('/privacy')).toBe('privacy');
    expect(routeForPath('/docs')).toBe('docs');
    expect(routeForPath('/')).toBe('editor');
    // /export is the hidden route the server's worker loads (server/03,
    // ADR-0003) — a real route, not the editor fallback.
    expect(routeForPath('/export')).toBe('export');
  });

  it('gives unknown paths the 404 instead of the editor', () => {
    // launch-chrome spec: a fresh editor on a mistyped address reads as
    // broken rather than intentional.
    expect(routeForPath('/this/path/does/not/exist')).toBe('not-found');
    expect(routeForPath('/Pricing')).toBe('not-found');
  });
});

describe('useRoute + navigate', () => {
  it('starts from the current path and follows pushState navigations', () => {
    render(<RouteProbe />);
    expect(screen.getByTestId('route')).toHaveTextContent('editor');

    act(() => navigate('/pricing'));
    expect(screen.getByTestId('route')).toHaveTextContent('pricing');
    expect(window.location.pathname).toBe('/pricing');
  });

  it('follows browser back via popstate', async () => {
    render(<RouteProbe />);
    act(() => navigate('/pricing'));
    expect(screen.getByTestId('route')).toHaveTextContent('pricing');

    // jsdom dispatches popstate asynchronously.
    window.history.back();
    await waitFor(() =>
      expect(screen.getByTestId('route')).toHaveTextContent('editor'),
    );
  });
});

describe('Link', () => {
  it('navigates in-app without a full page load', async () => {
    const user = userEvent.setup();
    render(
      <>
        <RouteProbe />
        <Link to="/pricing">Pricing</Link>
      </>,
    );

    await user.click(screen.getByRole('link', { name: 'Pricing' }));

    expect(screen.getByTestId('route')).toHaveTextContent('pricing');
    expect(window.location.pathname).toBe('/pricing');
  });

  it('leaves modified clicks (new tab) to the browser', async () => {
    const user = userEvent.setup();
    render(<Link to="/pricing">Pricing</Link>);

    await user.keyboard('{Control>}');
    await user.click(screen.getByRole('link', { name: 'Pricing' }));

    expect(screen.queryByTestId('route')).not.toBeInTheDocument();
  });
});
