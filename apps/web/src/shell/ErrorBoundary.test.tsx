// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Bomb({ cause }: { cause: unknown }): never {
  throw cause;
}

describe('ErrorBoundary', () => {
  it('renders the section fallback instead of unmounting the tree', () => {
    // React logs the caught error; keep the test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <ErrorBoundary label="The Orders section">
        <Bomb cause={new Error('render blew up')} />
      </ErrorBoundary>,
    );

    // An internal render error is never the user's input — the safe generic
    // message shows, not the exception text.
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong.');
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
  });

  it('names the offline case plainly instead of the browser’s raw error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <ErrorBoundary label="The Orders section">
        <Bomb cause={new TypeError('Failed to fetch')} />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      /Couldn't reach the server/,
    );
  });

  it('recovers when the children are remounted', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let shouldThrow = true;

    const { rerender } = render(
      <ErrorBoundary label="The Orders section">
        {shouldThrow ? (
          <Bomb cause={new Error('transient')} />
        ) : (
          <p>Recovered content</p>
        )}
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    shouldThrow = false;
    screen.getByRole('button', { name: 'Try again' }).click();
    rerender(
      <ErrorBoundary label="The Orders section">
        {shouldThrow ? (
          <Bomb cause={new Error('transient')} />
        ) : (
          <p>Recovered content</p>
        )}
      </ErrorBoundary>,
    );

    expect(screen.getByText('Recovered content')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
