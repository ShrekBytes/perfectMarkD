// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '../testing/json-response';
import { PRICING_FAILURE, PRICING_RESPONSE } from '../testing/pricing-response';
import { resetPricingStoreForTests, usePricing } from './store';

const PRICING = PRICING_RESPONSE;

/** Renders the store's state, so a suite asserts the numbers a surface would
 *  read rather than the store's internals. */
function Harness() {
  const { prices, limits, status } = usePricing();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="pro-monthly">
        {prices ? prices.pro.monthly : 'none'}
      </span>
      <span data-testid="pro-twelve">
        {prices ? prices.pro.durations[12] : 'none'}
      </span>
      <span data-testid="pro-page-cap">
        {limits ? limits.pro.pageCap : 'none'}
      </span>
    </div>
  );
}

function stubFetch(response: () => Promise<Response>) {
  const fetchMock = vi.fn(() => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  resetPricingStoreForTests();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the pricing read', () => {
  it('reads the endpoint once and publishes what it returned', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(jsonResponse(200, PRICING)),
    );

    render(<Harness />);

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('ready'),
    );
    expect(screen.getByTestId('pro-monthly')).toHaveTextContent('4.5');
    // The stored twelve-month figure, whatever the Admin decided it to be.
    expect(screen.getByTestId('pro-twelve')).toHaveTextContent('47');
    expect(screen.getByTestId('pro-page-cap')).toHaveTextContent('500');
    expect(fetchMock).toHaveBeenCalledWith('/api/pricing');
  });

  it('asks for no credentials — the endpoint is public', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(jsonResponse(200, PRICING)),
    );

    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('ready'),
    );

    // No session is sent and none is needed; a visitor who has never signed in
    // reads the same prices.
    expect(fetchMock.mock.calls[0]).toEqual(['/api/pricing']);
  });

  it('fetches once for two mounted surfaces', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(jsonResponse(200, PRICING)),
    );

    render(
      <>
        <Harness />
        <Harness />
      </>,
    );
    await waitFor(() =>
      expect(screen.getAllByTestId('status')[0]).toHaveTextContent('ready'),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not read a second time once the numbers have landed', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(jsonResponse(200, PRICING)),
    );

    const { unmount } = render(<Harness />);
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('ready'),
    );
    unmount();

    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('ready'),
    );

    // A price that has not changed must not be re-read into a second paint.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports unavailable and holds no number when the read fails', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    render(<Harness />);

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('unavailable'),
    );
    // Never a fallback to the seeded default: a wrong price read as current is
    // the failure this store exists to remove.
    expect(screen.getByTestId('pro-monthly')).toHaveTextContent('none');
    expect(screen.getByTestId('pro-page-cap')).toHaveTextContent('none');
  });

  it('reports unavailable on a 500 rather than showing a number', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(500, PRICING_FAILURE)));

    render(<Harness />);

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('unavailable'),
    );
    expect(screen.getByTestId('pro-twelve')).toHaveTextContent('none');
  });

  it('reads again after a failure, so a blip is not a pinned outage', async () => {
    let attempt = 0;
    const fetchMock = vi.fn(() => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(jsonResponse(200, PRICING_RESPONSE));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = render(<Harness />);
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('unavailable'),
    );
    unmount();

    // A visitor who reopens the pricing modal after a blip gets the numbers
    // rather than a session-long outage.
    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('ready'),
    );
    expect(screen.getByTestId('pro-twelve')).toHaveTextContent('47');
  });

  it('reports unavailable when the body is not the shape it renders', async () => {
    // A proxy answering HTML, or a truncated body: a 200 that is not a
    // pricing payload must not reach a formatter as `undefined`.
    stubFetch(() =>
      Promise.resolve(jsonResponse(200, { prices: { pro: { monthly: 3 } } })),
    );

    render(<Harness />);

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('unavailable'),
    );
    expect(screen.getByTestId('pro-monthly')).toHaveTextContent('none');
  });
});
