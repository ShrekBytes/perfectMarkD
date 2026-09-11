// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuditLog } from './AuditLog';
import type { AuditEntry } from './api';

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 1,
    adminEmail: 'owner@example.com',
    action: 'order.verify',
    targetType: 'order',
    targetId: '7',
    before: { order: { status: 'pending' }, entitlement: null },
    after: {
      order: { status: 'verified' },
      entitlement: { plan: 'pro', expiresAt: '2026-12-11T00:00:00.000Z' },
    },
    createdAt: '2026-09-11T08:30:00.000Z',
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
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

it('lists audit entries with the admin, action, and before/after', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        jsonResponse(200, {
          entries: [
            entry(),
            entry({
              id: 2,
              action: 'order.reject',
              targetId: '9',
              before: { order: { status: 'pending', rejectReason: null } },
              after: {
                order: { status: 'rejected', rejectReason: 'Wrong amount.' },
              },
            }),
          ],
        }),
      ),
    ),
  );

  render(<AuditLog />);

  const rows = await screen.findAllByTestId('audit-row');
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent('owner@example.com');
  expect(rows[0]).toHaveTextContent('order.verify');
  expect(rows[0]).toHaveTextContent('Order #7');
  // Before/after are visible so the trail explains what changed.
  expect(rows[0]).toHaveTextContent('order.verify');
  expect(rows[0]?.textContent).toContain('"status":"verified"');
  expect(rows[1]?.textContent).toContain('Wrong amount.');
});

it('shows an empty state before any admin action exists', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(jsonResponse(200, { entries: [] }))),
  );

  render(<AuditLog />);

  expect(await screen.findByTestId('audit-empty')).toBeInTheDocument();
});

it('shows a retryable error when the log cannot load', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new TypeError('network down'))),
  );

  render(<AuditLog />);

  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByTestId('audit-retry')).toBeInTheDocument();
});

it('retries after an error', async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    if (fetchMock.mock.calls.length === 1) {
      return Promise.reject(new TypeError('network down'));
    }
    expect(String(input)).toBe('/api/admin/audit');
    return Promise.resolve(jsonResponse(200, { entries: [entry()] }));
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<AuditLog />);
  expect(await screen.findByRole('alert')).toBeInTheDocument();

  await user.click(screen.getByTestId('audit-retry'));

  expect(await screen.findAllByTestId('audit-row')).toHaveLength(1);
});
