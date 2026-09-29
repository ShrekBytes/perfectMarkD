// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SettingsPanel } from './SettingsPanel';
import type { AdminSettings } from './api';
import { jsonResponse } from '../testing/json-response';

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
    pro: { pageCap: 300, quotaMonthly: 300, aiActionsMonthly: 100 },
    premium: { pageCap: 1000, quotaMonthly: 1000, aiActionsMonthly: 300 },
  },
  ltcRate: {
    usdtPerLtc: null,
    lastFetchedAt: null,
    ageMs: null,
    lastAttemptAt: null,
    lastError: null,
  },
  aiProvider: {
    enabled: true,
    baseUrl: 'https://openrouter.ai/api/v1',
    model: '',
    stylesheetModel: null,
    reasoningEffort: 'medium',
    contextWindow: 128000,
    maxOutputTokens: 16000,
    maxInputCharacters: 60000,
    timeoutSeconds: 60,
    burstPerMinute: 10,
  },
  aiKeyPresent: false,
};

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
  expect(screen.getByTestId('limit-pro-aiActionsMonthly')).toHaveValue(100);
  expect(screen.getByTestId('ai-base-url')).toHaveValue(
    'https://openrouter.ai/api/v1',
  );
  expect(screen.getByTestId('ai-model')).toHaveValue('');
  expect(screen.getByTestId('ai-reasoning-effort')).toHaveValue('medium');
  expect(screen.getByTestId('ai-context-window')).toHaveValue(128000);
  expect(screen.getByTestId('ai-max-output-tokens')).toHaveValue(16000);
  expect(screen.getByTestId('ai-key-present')).toHaveTextContent(
    /API key: not set/,
  );
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
  const premiumAi = screen.getByTestId('limit-premium-aiActionsMonthly');
  await user.clear(premiumAi);
  await user.type(premiumAi, '0');
  await user.click(screen.getByTestId('limits-save'));

  await waitFor(() =>
    expect(screen.getByTestId('limits-save-saved')).toBeInTheDocument(),
  );
  expect(savedBodies).toEqual([
    {
      key: 'limits',
      body: {
        pro: { pageCap: 300, quotaMonthly: 350, aiActionsMonthly: 100 },
        // Zero is legal: it disables AI Actions for the plan.
        premium: { pageCap: 1000, quotaMonthly: 1000, aiActionsMonthly: 0 },
      },
    },
  ]);
});

it('shows the Rate, its age, and the last error, and offers no way to edit it', async () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const settings: AdminSettings = {
    ...SEEDED,
    ltcRate: {
      usdtPerLtc: 69.82,
      lastFetchedAt: twoHoursAgo.toISOString(),
      ageMs: 2 * 60 * 60 * 1000,
      lastAttemptAt: twoHoursAgo.toISOString(),
      lastError: null,
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(jsonResponse(200, { settings }))),
  );

  render(<SettingsPanel />);

  expect(await screen.findByTestId('ltc-rate-value')).toHaveTextContent(
    '69.82',
  );
  expect(screen.getByTestId('ltc-rate-age')).toHaveTextContent(
    'Fetched 2 h ago.',
  );
  // No control anywhere in the section: the number is not the Admin's to set.
  expect(screen.queryByTestId('ltc-rate-input')).not.toBeInTheDocument();
  expect(screen.queryByTestId('ltc-rate-save')).not.toBeInTheDocument();
});

it('surfaces the last fetch failure and says the good rate is still in use', async () => {
  const aDayAgo = new Date(Date.now() - 26 * 60 * 60 * 1000);
  const anHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const settings: AdminSettings = {
    ...SEEDED,
    ltcRate: {
      usdtPerLtc: 69.82,
      lastFetchedAt: aDayAgo.toISOString(),
      ageMs: 26 * 60 * 60 * 1000,
      lastAttemptAt: anHourAgo.toISOString(),
      lastError: 'The rate feed could not be reached.',
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(jsonResponse(200, { settings }))),
  );

  render(<SettingsPanel />);

  expect(await screen.findByTestId('ltc-rate-error')).toHaveTextContent(
    'The rate feed could not be reached. The last good rate is still in use.',
  );
  expect(screen.getByTestId('ltc-rate-age')).toHaveTextContent(
    'Fetched 1 d ago.',
  );
  expect(screen.getByTestId('ltc-rate-last-attempt')).toHaveTextContent(
    'Last attempt 1 h ago.',
  );
});

it('says the Rate is not set yet before the first successful fetch', async () => {
  const settings: AdminSettings = {
    ...SEEDED,
    ltcRate: {
      usdtPerLtc: null,
      lastFetchedAt: null,
      ageMs: null,
      lastAttemptAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      lastError: 'The rate feed could not be reached.',
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(jsonResponse(200, { settings }))),
  );

  render(<SettingsPanel />);

  expect(await screen.findByTestId('ltc-rate-value')).toHaveTextContent(
    'Not set yet',
  );
  expect(screen.getByTestId('ltc-rate-age')).toHaveTextContent(
    'Never fetched.',
  );
  expect(screen.getByTestId('ltc-rate-error')).toBeInTheDocument();
});

it('distinguishes a never-fetched Rate from a hand-set one', async () => {
  // An instance that typed its Rate before the job existed: a figure with no
  // fetch behind it. It is still quoted, and saying "never fetched" alone
  // would read as "nothing is configured" — which is not the same problem.
  const settings: AdminSettings = {
    ...SEEDED,
    ltcRate: {
      usdtPerLtc: 320.5,
      lastFetchedAt: null,
      ageMs: null,
      lastAttemptAt: null,
      lastError: null,
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(jsonResponse(200, { settings }))),
  );

  render(<SettingsPanel />);

  expect(await screen.findByTestId('ltc-rate-value')).toHaveTextContent(
    '320.5',
  );
  expect(screen.getByTestId('ltc-rate-age')).toHaveTextContent(
    /never fetched by a job/i,
  );
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

it('saves the AI provider config and reports a draft test connection', async () => {
  const user = userEvent.setup();
  let savedAiProvider: Record<string, unknown> | null = null;
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/admin/settings') {
      return Promise.resolve(
        jsonResponse(200, { settings: { ...SEEDED, aiKeyPresent: true } }),
      );
    }
    if (url === '/api/admin/settings/ai/test') {
      expect(init?.method).toBe('POST');
      const body = JSON.parse(String(init?.body)) as { model: string };
      // The draft, not the saved config, is what gets tested.
      expect(body.model).toBe('vendor/model');
      return Promise.resolve(
        jsonResponse(200, {
          report: {
            ok: true,
            keyPresent: true,
            model: {
              id: 'vendor/model',
              contextLength: 200000,
              maxOutputTokens: 8000,
            },
            warnings: [
              "The configured output cap (16000 tokens) is larger than the model's published completion cap (8000 tokens).",
            ],
            error: null,
            detail: null,
          },
        }),
      );
    }
    if (url === '/api/admin/settings/aiProvider') {
      expect(init?.method).toBe('PUT');
      savedAiProvider = JSON.parse(String(init?.body)) as Record<
        string,
        unknown
      >;
      return Promise.resolve(
        jsonResponse(200, {
          settings: {
            ...SEEDED,
            aiProvider: savedAiProvider,
            aiKeyPresent: true,
          },
        }),
      );
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<SettingsPanel />);
  await screen.findByTestId('ai-model');
  expect(screen.getByTestId('ai-key-present')).toHaveTextContent(
    /API key: set in this instance’s environment/,
  );

  await user.type(screen.getByTestId('ai-model'), 'vendor/model');
  await user.selectOptions(screen.getByTestId('ai-reasoning-effort'), 'high');

  // The panel states the caps and what the model publishes — and no price: cost
  // arithmetic on a worst case from two caps and two rates cannot plan a
  // budget around, so there is no readout to read.
  expect(screen.queryByTestId('ai-cost')).toBeNull();
  expect(screen.queryByTestId('ai-cost-per-action')).toBeNull();

  await user.click(screen.getByTestId('ai-test'));

  expect(await screen.findByTestId('ai-test-status')).toHaveTextContent(
    'The endpoint answered.',
  );
  expect(screen.getByTestId('ai-test-model')).toHaveTextContent(
    '200000 tokens',
  );
  expect(screen.getByTestId('ai-test-model')).toHaveTextContent('8000 tokens');
  expect(screen.getByTestId('ai-test-warning')).toHaveTextContent(
    /larger than the model's published completion cap/,
  );

  await user.click(screen.getByTestId('ai-save'));
  await waitFor(() =>
    expect(screen.getByTestId('ai-save-saved')).toBeInTheDocument(),
  );
  expect(savedAiProvider).toMatchObject({
    enabled: true,
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'vendor/model',
    stylesheetModel: null,
    reasoningEffort: 'high',
    contextWindow: 128000,
    maxOutputTokens: 16000,
  });
});

it('shows a failed connection with its message and upstream detail', async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/admin/settings') {
      return Promise.resolve(jsonResponse(200, { settings: SEEDED }));
    }
    if (url === '/api/admin/settings/ai/test') {
      return Promise.resolve(
        jsonResponse(200, {
          report: {
            ok: false,
            keyPresent: true,
            model: null,
            warnings: [],
            error: 'The provider answered with HTTP 401.',
            detail: '{"error":{"message":"invalid key"}}',
          },
        }),
      );
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<SettingsPanel />);
  await screen.findByTestId('ai-test');
  await user.click(screen.getByTestId('ai-test'));

  const result = await screen.findByTestId('ai-test-result');
  expect(result).toHaveTextContent('The endpoint did not answer.');
  expect(result).toHaveTextContent('The provider answered with HTTP 401.');
  expect(screen.getByTestId('ai-test-detail')).toHaveTextContent('invalid key');
  // Nothing states a cost: a failed probe leaves the caps as they were.
  expect(screen.queryByTestId('ai-cost')).toBeNull();
});

it('rejects an AI cap outside the context window client-side before a request', async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    expect(String(input)).toBe('/api/admin/settings');
    return Promise.resolve(jsonResponse(200, { settings: SEEDED }));
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<SettingsPanel />);
  await screen.findByTestId('ai-context-window');

  const window = screen.getByTestId('ai-context-window');
  await user.clear(window);
  await user.type(window, '8000');

  await user.click(screen.getByTestId('ai-test'));
  expect(await screen.findByTestId('ai-test-error')).toHaveTextContent(
    /output cap inside the context window/,
  );
  await user.click(screen.getByTestId('ai-save'));
  expect(await screen.findByTestId('ai-save-error')).toHaveTextContent(
    /output cap inside the context window/,
  );
  // Only the initial load request happened.
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
