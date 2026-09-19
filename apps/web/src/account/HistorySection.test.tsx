// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HistorySection } from './HistorySection';
import { jsonResponse } from '../testing/json-response';

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    name: 'Quarterly Report',
    pages: 12,
    sizeBytes: 5 * 1024 * 1024,
    createdAt: '2026-09-10T08:30:00.000Z',
    expiresAt: '2026-10-10T08:30:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('unexpected fetch'))),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('lists the user’s exports with their metadata', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string | URL | Request) => {
      expect(String(url)).toBe('/api/history');
      return Promise.resolve(
        jsonResponse(200, {
          entries: [
            entry(),
            entry({
              id: 3,
              name: 'Thesis draft',
              pages: 41,
              sizeBytes: 999,
              createdAt: '2026-09-01T00:00:00.000Z',
            }),
          ],
        }),
      );
    }),
  );

  render(<HistorySection />);

  const rows = await screen.findAllByTestId('history-row');
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent('Quarterly Report');
  expect(rows[0]).toHaveTextContent('2026-09-10');
  expect(rows[0]).toHaveTextContent('12 pages');
  expect(rows[0]).toHaveTextContent('5 MB');
  expect(rows[1]).toHaveTextContent('Thesis draft');
  expect(rows[1]).toHaveTextContent('999 B');
});

it('downloads an entry through the object-URL anchor flow', async () => {
  const user = userEvent.setup();
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string | URL | Request) => {
      urls.push(String(url));
      if (String(url) === '/api/history/7') {
        return Promise.resolve(
          new Response(new Uint8Array([0x25, 0x50, 0x44]).buffer, {
            status: 200,
            headers: { 'content-type': 'application/pdf' },
          }),
        );
      }
      return Promise.resolve(jsonResponse(200, { entries: [entry()] }));
    }),
  );
  const clicks: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push(`${this.download} ${this.href}`);
  });
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:fake'),
    revokeObjectURL: vi.fn(),
  });

  render(<HistorySection />);
  await user.click(await screen.findByRole('button', { name: /Download/ }));

  await waitFor(() => {
    expect(urls).toContain('/api/history/7');
  });
  expect(clicks).toEqual(['Quarterly Report.pdf blob:fake']);
  expect(
    // The downloaded name always ends in .pdf, whatever the document was called.
    clicks[0]!.startsWith('Quarterly Report.pdf'),
  ).toBe(true);
});

it('offers the plans when the server rejects a non-Premium user', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        jsonResponse(403, {
          error:
            'Export History is part of Premium — your exports are not kept.',
          code: 'premium_required',
        }),
      ),
    ),
  );

  render(<HistorySection />);

  expect(await screen.findByRole('alert')).toHaveTextContent(
    /part of Premium/i,
  );
  expect(screen.getByRole('link', { name: 'View plans' })).toHaveAttribute(
    'href',
    '/pricing',
  );
});

it('shows an empty state until the first Premium export exists', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(jsonResponse(200, { entries: [] }))),
  );

  render(<HistorySection />);

  expect(await screen.findByText('No exports yet.')).toBeInTheDocument();
  // The empty state explains what History keeps, instead of a blank list.
  expect(screen.getByText(/kept here for 30 days/)).toBeInTheDocument();
});

it('recovers from a failed load via Retry', async () => {
  const user = userEvent.setup();
  let failing = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      if (failing) return Promise.reject(new TypeError('network down'));
      return Promise.resolve(jsonResponse(200, { entries: [entry()] }));
    }),
  );

  render(<HistorySection />);
  expect(await screen.findByRole('alert')).toHaveTextContent(/network down/i);

  failing = false;
  await user.click(screen.getByRole('button', { name: 'Retry' }));

  expect(await screen.findByTestId('history-row')).toBeInTheDocument();
});
