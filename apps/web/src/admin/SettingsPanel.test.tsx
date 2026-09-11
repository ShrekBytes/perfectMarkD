// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SettingsPanel } from './SettingsPanel';
import type { AdminSettings } from './api';

const SEEDED: AdminSettings = {
  wallets: {
    'USDT-TRC20': '',
    'USDT-BEP20': '',
    LTC: '',
  },
  prices: {
    pro: { monthly: 3, durations: { 1: 3, 3: 9, 6: 18, 12: 30 } },
    premium: { monthly: 7, durations: { 1: 7, 3: 21, 6: 42, 12: 70 } },
  },
  limits: {
    pro: { pageCap: 300, quotaMonthly: 300 },
    premium: { pageCap: 1000, quotaMonthly: 1000 },
  },
  ltcRateUsdt: null,
};

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

it('renders every seeded setting', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(jsonResponse(200, { settings: SEEDED }))),
  );

  render(<SettingsPanel />);

  expect(await screen.findByTestId('wallet-input-USDT-TRC20')).toHaveValue('');
  expect(screen.getByTestId('price-pro-monthly')).toHaveValue(3);
  expect(screen.getByTestId('price-premium-12')).toHaveValue(70);
  expect(screen.getByTestId('limit-pro-pageCap')).toHaveValue(300);
  expect(screen.getByTestId('limit-premium-quotaMonthly')).toHaveValue(1000);
  expect(screen.getByTestId('ltc-rate-input')).toHaveValue(null);
});

it('shows the wallet warning on change and saves to the wallets key', async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/admin/settings') {
      return Promise.resolve(jsonResponse(200, { settings: SEEDED }));
    }
    expect(url).toBe('/api/admin/settings/wallets');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({
      'USDT-TRC20': 'TNewTronWallet',
      'USDT-BEP20': '',
      LTC: '',
    });
    return Promise.resolve(
      jsonResponse(200, {
        settings: {
          ...SEEDED,
          wallets: {
            'USDT-TRC20': 'TNewTronWallet',
            'USDT-BEP20': '',
            LTC: '',
          },
        },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<SettingsPanel />);
  await screen.findByTestId('wallet-input-USDT-TRC20');

  expect(screen.queryByTestId('wallet-warning')).not.toBeInTheDocument();
  await user.type(
    screen.getByTestId('wallet-input-USDT-TRC20'),
    'TNewTronWallet',
  );

  // The prominent guard: changing a wallet address warns before saving.
  expect(screen.getByTestId('wallet-warning')).toHaveTextContent(
    /funds sent to a wrong address cannot be recovered/i,
  );

  await user.click(screen.getByTestId('wallets-save'));

  await waitFor(() =>
    expect(screen.getByTestId('wallets-save-saved')).toBeInTheDocument(),
  );
});

it('saves plan limits and the LTC rate to their own keys', async () => {
  const user = userEvent.setup();
  const savedBodies: Array<Record<string, unknown>> = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/admin/settings') {
      return Promise.resolve(jsonResponse(200, { settings: SEEDED }));
    }
    expect(init?.method).toBe('PUT');
    savedBodies.push({
      key: url.replace('/api/admin/settings/', ''),
      body: JSON.parse(String(init?.body)),
    });
    return Promise.resolve(jsonResponse(200, { settings: SEEDED }));
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<SettingsPanel />);
  await screen.findByTestId('limit-pro-pageCap');

  const quota = screen.getByTestId('limit-pro-quotaMonthly');
  await user.clear(quota);
  await user.type(quota, '350');
  await user.click(screen.getByTestId('limits-save'));

  const rate = screen.getByTestId('ltc-rate-input');
  await user.type(rate, '320.5');
  await user.click(screen.getByTestId('ltc-rate-save'));

  await waitFor(() =>
    expect(screen.getByTestId('ltc-rate-save-saved')).toBeInTheDocument(),
  );
  expect(savedBodies).toEqual([
    {
      key: 'limits',
      body: {
        pro: { pageCap: 300, quotaMonthly: 350 },
        premium: { pageCap: 1000, quotaMonthly: 1000 },
      },
    },
    { key: 'ltcRateUsdt', body: 320.5 },
  ]);
});

it('rejects invalid limits client-side before a request', async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    expect(String(input)).toBe('/api/admin/settings');
    return Promise.resolve(jsonResponse(200, { settings: SEEDED }));
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<SettingsPanel />);
  await screen.findByTestId('limit-pro-pageCap');

  const pageCap = screen.getByTestId('limit-pro-pageCap');
  await user.clear(pageCap);
  await user.type(pageCap, '0');
  await user.click(screen.getByTestId('limits-save'));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Page caps and quotas must be whole numbers above zero.',
  );
  expect(screen.queryByTestId('limits-save-saved')).not.toBeInTheDocument();
  // Only the initial load request happened.
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('rejects non-numeric prices client-side before a request', async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    expect(String(input)).toBe('/api/admin/settings');
    return Promise.resolve(jsonResponse(200, { settings: SEEDED }));
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<SettingsPanel />);
  await screen.findByTestId('price-pro-monthly');

  const monthly = screen.getByTestId('price-pro-monthly');
  await user.clear(monthly);
  await user.type(monthly, '-2');
  await user.click(screen.getByTestId('prices-save'));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Every amount must be a number above zero.',
  );
  // Only the initial load request happened.
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
