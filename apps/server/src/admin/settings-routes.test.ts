import { afterEach, describe, expect, it } from 'vitest';
import { createApp, type AppType } from '../index.js';
import { createTestDatabase, removeTestDatabase } from '../db/testing.js';
import type { AppDatabase } from '../db/database.js';
import {
  AI_PROVIDER_KEY,
  DEFAULT_AI_PROVIDER_CONFIG,
  getAiProviderConfig,
  getPlanLimits,
  getPlanPrices,
  getWallets,
  PRICES_KEY,
  WALLETS_KEY,
} from '../db/settings.js';
import { settingsKv } from '../db/schema.js';
import { AiProviderError, type AiProvider } from '../ai/provider.js';

const SESSION_SECRET = 'test-session-secret';

const WALLETS = {
  'USDT-TRC20': 'TTronWalletAddressForTests1234',
  'USDT-BEP20': '0xBep20WalletAddressForTests000001',
  LTC: 'ltc1qTestWalletAddressForTests00000',
};

const NOW = new Date('2026-09-11T00:00:00.000Z');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function makeApp(options: Partial<Parameters<typeof createApp>[0]> = {}): {
  app: AppType;
  db: AppDatabase;
} {
  const { db, dir } = createTestDatabase();
  cleanup = () => removeTestDatabase(dir);
  const app = createApp({
    db,
    log: () => {},
    sessionSecret: SESSION_SECRET,
    ...options,
  });
  return { app, db };
}

function request(
  app: AppType,
  path: string,
  method: 'GET' | 'POST' | 'PUT',
  options: { body?: unknown; cookie?: string } = {},
) {
  return app.request(path, {
    method,
    headers: {
      ...(options.body !== undefined
        ? { 'content-type': 'application/json' }
        : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
  });
}

function getJson(app: AppType, path: string, cookie?: string) {
  return request(app, path, 'GET', { cookie });
}

function putJson(app: AppType, path: string, body: unknown, cookie?: string) {
  return request(app, path, 'PUT', { body, cookie });
}

function postJson(app: AppType, path: string, body: unknown, cookie?: string) {
  return request(app, path, 'POST', { body, cookie });
}

function sessionCookie(res: Response): string {
  const header = res.headers.get('set-cookie');
  if (!header) throw new Error('no set-cookie header');
  const pair = header.split(';')[0];
  if (!pair) throw new Error(`malformed set-cookie: ${header}`);
  return pair;
}

async function signedIn(app: AppType, email = 'reader@example.com') {
  const res = await postJson(app, '/api/auth/register', {
    email,
    password: 'correct horse battery',
  });
  return sessionCookie(res);
}

async function adminSignedIn(app: AppType, email = 'owner@example.com') {
  return signedIn(app, email);
}

async function auditEntries(app: AppType, cookie: string) {
  const res = await getJson(app, '/api/admin/audit', cookie);
  expect(res.status).toBe(200);
  return ((await res.json()) as { entries: unknown[] }).entries;
}

describe('gate', () => {
  it('rejects anonymous visitors with 401 and non-admins with 403', async () => {
    const { app } = makeApp({ adminEmail: 'owner@example.com' });
    const cookie = await signedIn(app);

    expect((await getJson(app, '/api/admin/settings')).status).toBe(401);
    expect((await getJson(app, '/api/admin/settings', cookie)).status).toBe(
      403,
    );
    expect(
      (await putJson(app, '/api/admin/settings/wallets', WALLETS, cookie))
        .status,
    ).toBe(403);
    expect(
      (
        await postJson(
          app,
          '/api/admin/settings/ai/test',
          DEFAULT_AI_PROVIDER_CONFIG,
          cookie,
        )
      ).status,
    ).toBe(403);
    expect(
      (await postJson(app, '/api/admin/settings/ai/test', {})).status,
    ).toBe(401);
  });
});

describe('GET /api/admin/settings', () => {
  it('returns the seeded defaults (no placeholder wallets, rates, or model ids ship)', async () => {
    const { app } = makeApp({ adminEmail: 'owner@example.com' });
    const admin = await adminSignedIn(app);

    const res = await getJson(app, '/api/admin/settings', admin);

    expect(res.status).toBe(200);
    const { settings } = (await res.json()) as {
      settings: Record<string, unknown>;
    };
    expect(settings).toEqual({
      wallets: {
        'USDT-TRC20': '',
        'USDT-BEP20': '',
        LTC: '',
      },
      prices: {
        pro: {
          monthly: 3,
          durations: { 1: 3, 3: 9, 6: 18, 12: 30 },
        },
        premium: {
          monthly: 7,
          durations: { 1: 7, 3: 21, 6: 42, 12: 70 },
        },
      },
      limits: {
        pro: { pageCap: 300, quotaMonthly: 300, aiActionsMonthly: 100 },
        premium: { pageCap: 1000, quotaMonthly: 1000, aiActionsMonthly: 300 },
      },
      ltcRateUsdt: null,
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
      // No key in this app's AI context — and never the key itself, only
      // this boolean.
      aiKeyPresent: false,
    });
  });

  it('reports whether the environment has a key without ever returning it', async () => {
    const { app } = makeApp({
      adminEmail: 'owner@example.com',
      ai: { apiKey: 'sk-secret-provider-key' },
    });
    const admin = await adminSignedIn(app);

    const res = await getJson(app, '/api/admin/settings', admin);
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(JSON.parse(text).settings.aiKeyPresent).toBe(true);
    expect(text).not.toContain('sk-secret-provider-key');
  });
});

describe('PUT /api/admin/settings/:key', () => {
  it('updates wallets, writes an audit entry, and feeds new Orders', async () => {
    const { app, db } = makeApp({
      adminEmail: 'owner@example.com',
      now: () => NOW,
    });
    const admin = await adminSignedIn(app);

    const res = await putJson(
      app,
      '/api/admin/settings/wallets',
      WALLETS,
      admin,
    );

    expect(res.status).toBe(200);
    const { settings } = (await res.json()) as {
      settings: { wallets: Record<string, string> };
    };
    expect(settings.wallets).toEqual(WALLETS);
    expect(getWallets(db)).toEqual(WALLETS);

    const entries = (await auditEntries(app, admin)) as Array<{
      action: string;
      targetType: string;
      targetId: string;
      before: unknown;
      after: unknown;
    }>;
    expect(entries[0]).toMatchObject({
      action: 'settings.update',
      targetType: 'settings',
      targetId: WALLETS_KEY,
      before: { 'USDT-TRC20': '', 'USDT-BEP20': '', LTC: '' },
      after: WALLETS,
    });
  });

  it('takes effect on Order creation without a redeploy', async () => {
    const { app } = makeApp({ adminEmail: 'owner@example.com' });
    await signedIn(app);
    const admin = await adminSignedIn(app);

    await putJson(app, '/api/admin/settings/wallets', WALLETS, admin);
    const cookie = await signedIn(app, 'buyer@example.com');
    const created = await postJson(
      app,
      '/api/orders',
      {
        plan: 'pro',
        durationMonths: 3,
        paymentMethod: 'USDT-TRC20',
      },
      cookie,
    );

    expect(created.status).toBe(201);
    const { order } = (await created.json()) as {
      order: { walletAddress: string | null };
    };
    expect(order.walletAddress).toBe(WALLETS['USDT-TRC20']);
  });

  it('updates prices, audit-logs, and new Orders use them', async () => {
    const { app, db } = makeApp({
      adminEmail: 'owner@example.com',
      now: () => NOW,
    });
    const admin = await adminSignedIn(app);
    const prices = getPlanPrices(db);
    prices.pro = { monthly: 4, durations: { 1: 4, 3: 12, 6: 24, 12: 40 } };

    const res = await putJson(app, '/api/admin/settings/prices', prices, admin);

    expect(res.status).toBe(200);
    expect(getPlanPrices(db).pro.monthly).toBe(4);

    const entries = (await auditEntries(app, admin)) as Array<{
      targetId: string;
      before: unknown;
    }>;
    expect(entries[0]).toMatchObject({ targetId: PRICES_KEY });

    await putJson(app, '/api/admin/settings/wallets', WALLETS, admin);
    const cookie = await signedIn(app, 'buyer@example.com');
    const created = await postJson(
      app,
      '/api/orders',
      {
        plan: 'pro',
        durationMonths: 3,
        paymentMethod: 'USDT-TRC20',
      },
      cookie,
    );
    const { order } = (await created.json()) as {
      order: { amountExpected: string };
    };
    expect(order.amountExpected).toBe('12');
  });

  it('updates plan limits (page caps, monthly quotas, and AI allowance)', async () => {
    const { app, db } = makeApp({ adminEmail: 'owner@example.com' });
    const admin = await adminSignedIn(app);

    const res = await putJson(
      app,
      '/api/admin/settings/limits',
      {
        pro: { pageCap: 250, quotaMonthly: 150, aiActionsMonthly: 50 },
        premium: { pageCap: 1200, quotaMonthly: 2000, aiActionsMonthly: 0 },
      },
      admin,
    );

    expect(res.status).toBe(200);
    expect(getPlanLimits(db)).toEqual({
      pro: { pageCap: 250, quotaMonthly: 150, aiActionsMonthly: 50 },
      premium: { pageCap: 1200, quotaMonthly: 2000, aiActionsMonthly: 0 },
    });
  });

  it('sets the LTC rate and LTC Orders capture it', async () => {
    const { app, db } = makeApp({ adminEmail: 'owner@example.com' });
    await signedIn(app);
    const admin = await adminSignedIn(app);

    const res = await putJson(
      app,
      '/api/admin/settings/ltcRateUsdt',
      320.5,
      admin,
    );
    expect(res.status).toBe(200);

    await putJson(app, '/api/admin/settings/wallets', WALLETS, admin);
    const cookie = await signedIn(app, 'buyer@example.com');
    const created = await postJson(
      app,
      '/api/orders',
      {
        plan: 'pro',
        durationMonths: 3,
        paymentMethod: 'LTC',
      },
      cookie,
    );
    expect(created.status).toBe(201);
    const { order } = (await created.json()) as {
      order: {
        coin: string;
        amountExpected: string;
        ltcRateUsdt: string | null;
      };
    };
    expect(order.coin).toBe('LTC');
    expect(order.ltcRateUsdt).toBe('320.5');
    // 9 USDT at 320.5 USDT/LTC, rounded to LTC's 8 decimals.
    expect(order.amountExpected).toBe('0.02808112');
    void db;
  });

  it('clearing the LTC rate disables LTC payments again', async () => {
    const { app } = makeApp({ adminEmail: 'owner@example.com' });
    const admin = await adminSignedIn(app);

    await putJson(app, '/api/admin/settings/ltcRateUsdt', 320.5, admin);
    const cleared = await putJson(
      app,
      '/api/admin/settings/ltcRateUsdt',
      null,
      admin,
    );
    expect(cleared.status).toBe(200);
    const { settings } = (await cleared.json()) as {
      settings: { ltcRateUsdt: number | null };
    };
    expect(settings.ltcRateUsdt).toBeNull();
  });

  it('validates each key against the shapes the readers assume', async () => {
    const { app, db } = makeApp({ adminEmail: 'owner@example.com' });
    const admin = await adminSignedIn(app);

    const expect400 = async (key: string, body: unknown) => {
      const res = await putJson(app, `/api/admin/settings/${key}`, body, admin);
      expect(res.status).toBe(400);
    };

    await expect400('wallets', null);
    await expect400('wallets', { 'USDT-TRC20': 'x' });
    await expect400('wallets', { ...WALLETS, rogue: 'x' });
    await expect400('prices', { pro: { monthly: 3, durations: {} } });
    await expect400(
      'prices',
      // A zero price would make Orders free.
      {
        pro: { monthly: 0, durations: { 1: 3, 3: 9, 6: 18, 12: 30 } },
        premium: { monthly: 7, durations: { 1: 7, 3: 21, 6: 42, 12: 70 } },
      },
    );
    await expect400('limits', {
      pro: { pageCap: 300.5, quotaMonthly: 300, aiActionsMonthly: 100 },
      premium: { pageCap: 1000, quotaMonthly: 1000, aiActionsMonthly: 300 },
    });
    await expect400(
      'limits',
      // A negative AI allowance is malformed; zero is legal (AI disabled).
      {
        pro: { pageCap: 300, quotaMonthly: 300, aiActionsMonthly: -1 },
        premium: { pageCap: 1000, quotaMonthly: 1000, aiActionsMonthly: 300 },
      },
    );
    await expect400('ltcRateUsdt', -1);
    await expect400('ltcRateUsdt', 'free');
    await expect400('aiProvider', {});
    await expect400('aiProvider', {
      ...DEFAULT_AI_PROVIDER_CONFIG,
      reasoningEffort: 'maximum',
    });
    await expect400(
      'aiProvider',
      // A cap outside the window is a request that can never fit.
      {
        ...DEFAULT_AI_PROVIDER_CONFIG,
        contextWindow: 1000,
        maxOutputTokens: 2000,
      },
    );
    await expect400('aiProvider', {
      ...DEFAULT_AI_PROVIDER_CONFIG,
      baseUrl: 'ftp://ai.example.com',
    });
    await expect400(
      'aiProvider',
      // The key is environment configuration (ADR-0008): never a setting.
      { ...DEFAULT_AI_PROVIDER_CONFIG, apiKey: 'sk-secret-provider-key' },
    );

    // Nothing was written, and no audit entries exist.
    expect(db.select().from(settingsKv).all()).toHaveLength(4);
    expect((await auditEntries(app, admin)).length).toBe(0);
  });

  it('404s for unknown settings and rejects malformed JSON bodies', async () => {
    const { app, db } = makeApp({ adminEmail: 'owner@example.com' });
    const admin = await adminSignedIn(app);

    expect(
      (await putJson(app, '/api/admin/settings/nonsense', {}, admin)).status,
    ).toBe(404);

    const raw = await app.request('/api/admin/settings/wallets', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: admin,
      },
      body: '{not json',
    });
    expect(raw.status).toBe(400);
    void db;
  });
});

describe('PUT /api/admin/settings/aiProvider', () => {
  it('saves the config, audit-logs it, and never echoes the key', async () => {
    const { app, db } = makeApp({
      adminEmail: 'owner@example.com',
      now: () => NOW,
      ai: { apiKey: 'sk-secret-provider-key' },
    });
    const admin = await adminSignedIn(app);
    const config = {
      ...DEFAULT_AI_PROVIDER_CONFIG,
      model: 'vendor/model',
      reasoningEffort: 'high',
    };

    const res = await putJson(
      app,
      '/api/admin/settings/aiProvider',
      config,
      admin,
    );

    expect(res.status).toBe(200);
    const text = await res.text();
    const { settings } = JSON.parse(text) as {
      settings: { aiProvider: unknown; aiKeyPresent: boolean };
    };
    expect(settings.aiProvider).toEqual(config);
    expect(settings.aiKeyPresent).toBe(true);
    expect(text).not.toContain('sk-secret-provider-key');
    expect(getAiProviderConfig(db)).toEqual(config);

    const entries = (await auditEntries(app, admin)) as Array<{
      action: string;
      targetType: string;
      targetId: string;
      before: unknown;
      after: unknown;
    }>;
    expect(entries[0]).toMatchObject({
      action: 'settings.update',
      targetType: 'settings',
      targetId: AI_PROVIDER_KEY,
      before: DEFAULT_AI_PROVIDER_CONFIG,
      after: config,
    });
  });

  it('normalizes the base URL so the client can append its paths', async () => {
    const { app, db } = makeApp({ adminEmail: 'owner@example.com' });
    const admin = await adminSignedIn(app);

    const res = await putJson(
      app,
      '/api/admin/settings/aiProvider',
      {
        ...DEFAULT_AI_PROVIDER_CONFIG,
        model: 'vendor/model',
        baseUrl: 'https://ai.example.com/v1/',
      },
      admin,
    );

    expect(res.status).toBe(200);
    expect(getAiProviderConfig(db).baseUrl).toBe('https://ai.example.com/v1');
  });
});

/** A fake provider: every AI test runs against one, never a live API. */
function fakeProvider(overrides: Partial<AiProvider> = {}): AiProvider {
  return {
    complete: async () => ({ text: 'ok', finishReason: 'stop' }),
    modelInfo: async () => ({
      contextLength: 200_000,
      maxOutputTokens: 8_000,
      inputPricePerMillion: 0.15,
      outputPricePerMillion: 0.6,
    }),
    ...overrides,
  };
}

describe('POST /api/admin/settings/ai/test', () => {
  it("reports the endpoint's answer and the model's published numbers", async () => {
    const calls: Array<Parameters<AiProvider['complete']>[0]> = [];
    const provider = fakeProvider({
      complete: async (request) => {
        calls.push(request);
        return { text: 'ok', finishReason: 'stop' };
      },
    });
    const { app } = makeApp({
      adminEmail: 'owner@example.com',
      ai: { apiKey: 'sk-key', provider },
    });
    const admin = await adminSignedIn(app);
    const config = {
      ...DEFAULT_AI_PROVIDER_CONFIG,
      model: 'vendor/model',
      contextWindow: 256_000,
      maxOutputTokens: 20_000,
    };

    const res = await postJson(
      app,
      '/api/admin/settings/ai/test',
      config,
      admin,
    );

    expect(res.status).toBe(200);
    const { report } = (await res.json()) as { report: unknown };
    expect(report).toEqual({
      ok: true,
      keyPresent: true,
      model: {
        id: 'vendor/model',
        contextLength: 200_000,
        maxOutputTokens: 8_000,
        inputPricePerMillion: 0.15,
        outputPricePerMillion: 0.6,
      },
      // The published numbers disagree with the configured caps; the report
      // warns instead of silently correcting either side.
      warnings: [
        "The configured context window (256000 tokens) is larger than the model's published window (200000 tokens).",
        "The configured output cap (20000 tokens) is larger than the model's published completion cap (8000 tokens).",
      ],
      error: null,
      detail: null,
    });
    // One minimal, explicitly capped request with the configured effort.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'sk-key',
      model: 'vendor/model',
      maxOutputTokens: 16,
      reasoningEffort: 'medium',
    });
  });

  it('reports a provider failure with upstream detail, for the Admin', async () => {
    const provider = fakeProvider({
      complete: async () => {
        throw new AiProviderError(
          'http',
          'The provider answered with HTTP 401.',
          401,
          '{"error":{"message":"invalid key"}}',
        );
      },
      modelInfo: async () => null,
    });
    const { app } = makeApp({
      adminEmail: 'owner@example.com',
      ai: { apiKey: 'sk-key', provider },
    });
    const admin = await adminSignedIn(app);

    const res = await postJson(
      app,
      '/api/admin/settings/ai/test',
      { ...DEFAULT_AI_PROVIDER_CONFIG, model: 'vendor/model' },
      admin,
    );

    expect(res.status).toBe(200);
    const { report } = (await res.json()) as {
      report: {
        ok: boolean;
        model: unknown;
        warnings: string[];
        error: string;
        detail: string;
      };
    };
    expect(report.ok).toBe(false);
    expect(report.model).toBeNull();
    expect(report.warnings).toEqual([]);
    expect(report.error).toBe('The provider answered with HTTP 401.');
    expect(report.detail).toContain('invalid key');
  });

  it('reports a missing environment key without calling the provider', async () => {
    const calls: unknown[] = [];
    const provider = fakeProvider({
      complete: async (request) => {
        calls.push(request);
        return { text: 'ok', finishReason: 'stop' };
      },
    });
    const { app } = makeApp({
      adminEmail: 'owner@example.com',
      ai: { provider },
    });
    const admin = await adminSignedIn(app);

    const res = await postJson(
      app,
      '/api/admin/settings/ai/test',
      { ...DEFAULT_AI_PROVIDER_CONFIG, model: 'vendor/model' },
      admin,
    );

    const { report } = (await res.json()) as {
      report: { keyPresent: boolean; error: string };
    };
    expect(report.keyPresent).toBe(false);
    expect(report.error).toMatch(/AI_API_KEY/);
    expect(calls).toHaveLength(0);
  });

  it('asks for a model instead of calling with an empty one', async () => {
    const calls: unknown[] = [];
    const provider = fakeProvider({
      complete: async (request) => {
        calls.push(request);
        return { text: 'ok', finishReason: 'stop' };
      },
    });
    const { app } = makeApp({
      adminEmail: 'owner@example.com',
      ai: { apiKey: 'sk-key', provider },
    });
    const admin = await adminSignedIn(app);

    const res = await postJson(
      app,
      '/api/admin/settings/ai/test',
      DEFAULT_AI_PROVIDER_CONFIG,
      admin,
    );

    const { report } = (await res.json()) as {
      report: { keyPresent: boolean; error: string };
    };
    expect(report.keyPresent).toBe(true);
    expect(report.error).toMatch(/model/i);
    expect(calls).toHaveLength(0);
  });

  it('tests the draft it is given and refuses a malformed one before any call', async () => {
    const calls: Array<Parameters<AiProvider['complete']>[0]> = [];
    const provider = fakeProvider({
      complete: async (request) => {
        calls.push(request);
        return { text: 'ok', finishReason: 'stop' };
      },
    });
    const { app } = makeApp({
      adminEmail: 'owner@example.com',
      ai: { apiKey: 'sk-key', provider },
    });
    const admin = await adminSignedIn(app);

    await postJson(
      app,
      '/api/admin/settings/ai/test',
      { ...DEFAULT_AI_PROVIDER_CONFIG, model: 'draft/model' },
      admin,
    );
    expect(calls[0]?.model).toBe('draft/model');

    const rejected = await postJson(
      app,
      '/api/admin/settings/ai/test',
      { ...DEFAULT_AI_PROVIDER_CONFIG, contextWindow: 1, maxOutputTokens: 2 },
      admin,
    );
    expect(rejected.status).toBe(400);
    expect(calls).toHaveLength(1);
  });

  it('tests the saved config when no draft is sent', async () => {
    const calls: Array<Parameters<AiProvider['complete']>[0]> = [];
    const provider = fakeProvider({
      complete: async (request) => {
        calls.push(request);
        return { text: 'ok', finishReason: 'stop' };
      },
    });
    const { app } = makeApp({
      adminEmail: 'owner@example.com',
      ai: { apiKey: 'sk-key', provider },
    });
    const admin = await adminSignedIn(app);
    await putJson(
      app,
      '/api/admin/settings/aiProvider',
      { ...DEFAULT_AI_PROVIDER_CONFIG, model: 'saved/model' },
      admin,
    );

    const res = await app.request('/api/admin/settings/ai/test', {
      method: 'POST',
      headers: { cookie: admin },
    });

    expect(res.status).toBe(200);
    expect(calls[0]?.model).toBe('saved/model');
  });
});
