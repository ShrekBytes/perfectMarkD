import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp, type AppType } from './index.js';
import { createTestDatabase, removeTestDatabase } from './db/testing.js';
import type { AppDatabase } from './db/database.js';
import { aiUsage, entitlements, exportUsage, users } from './db/schema.js';
import { usagePeriod } from './quota.js';
import {
  AI_PROVIDER_KEY,
  DEFAULT_AI_PROVIDER_CONFIG,
  LIMITS_KEY,
  setSetting,
} from './db/settings.js';

const SESSION_SECRET = 'test-session-secret';

const NOW = new Date('2026-09-11T00:00:00.000Z');

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function makeApp(
  options: {
    adminEmail?: string;
    now?: () => Date;
    ai?: { apiKey?: string | null };
  } = {},
): {
  app: AppType;
  db: AppDatabase;
} {
  const { db, dir } = createTestDatabase();
  cleanup = () => removeTestDatabase(dir);
  const app = createApp({
    db,
    log: () => {},
    sessionSecret: SESSION_SECRET,
    adminEmail: options.adminEmail ?? null,
    now: options.now,
    ai: options.ai,
  });
  return { app, db };
}

function postJson(app: AppType, path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function sessionCookie(res: Response): string {
  const header = res.headers.get('set-cookie');
  if (!header) throw new Error('no set-cookie header');
  return header.split(';')[0]!;
}

async function registerViaApi(
  app: AppType,
  email = `u${Math.random().toString(36).slice(2)}@test.dev`,
): Promise<string> {
  const res = await postJson(app, '/api/auth/register', {
    email,
    password: 'correct horse battery staple',
  });
  expect(res.status).toBe(201);
  return sessionCookie(res);
}

function grant(
  db: AppDatabase,
  email: string,
  plan: 'pro' | 'premium',
  expiresInDays: number,
): void {
  const userId = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .get()!.id;
  db.insert(entitlements)
    .values({
      userId,
      plan,
      expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
    })
    .run();
}

interface MeResponse {
  email: string;
  isAdmin: boolean;
  plan: string | null;
  expiresAt: string | null;
  quota: { used: number; limit: number };
  flags: Record<string, boolean>;
  ai: {
    configured: boolean;
    included: boolean;
    access: boolean;
    disclosureSeen: boolean;
    remaining: number;
    period: string;
    resetsAt: string;
  };
}

async function getMe(app: AppType, cookie?: string): Promise<Response> {
  return app.request('/api/me', {
    headers: cookie ? { cookie } : {},
  });
}

describe('GET /api/me', () => {
  it('answers 401 when signed out', async () => {
    const { app } = makeApp();
    const res = await getMe(app);
    expect(res.status).toBe(401);
  });

  it('a fresh free user has no plan and a zero quota', async () => {
    const { app } = makeApp();
    const cookie = await registerViaApi(app);

    const res = await getMe(app, cookie);
    expect(res.status).toBe(200);
    const me = (await res.json()) as MeResponse;
    expect(me).toEqual({
      email: expect.any(String),
      isAdmin: false,
      plan: null,
      expiresAt: null,
      quota: { used: 0, limit: 0 },
      // billing/04: the gated Inspector controls — every flag locked.
      flags: {
        customPageSize: false,
        customStylesheet: false,
        bannerImages: false,
        backgroundImage: false,
        customFonts: false,
      },
      // ai-transforms/03: no key in the environment, no plan — AI is off,
      // the caller's own switch stays on.
      ai: {
        configured: false,
        included: false,
        access: true,
        disclosureSeen: false,
        maxInputCharacters: 60_000,
        allowance: 0,
        remaining: 0,
        period: usagePeriod(new Date()),
        resetsAt: expect.any(String),
      },
    });
  });

  it('an active Entitlement shows the plan, expiry, and plan quota', async () => {
    const { app, db } = makeApp();
    const email = `u${Math.random().toString(36).slice(2)}@test.dev`;
    const cookie = await registerViaApi(app, email);
    grant(db, email, 'pro', 30);

    const me = (await (await getMe(app, cookie)).json()) as MeResponse;
    expect(me.plan).toBe('pro');
    expect(me.expiresAt).toEqual(expect.any(String));
    expect(me.quota).toEqual({ used: 0, limit: 300 });
    // Both paid plans open every gated feature (billing/spec.md §Gated
    // features) — spot-check one flag per plan below.
    expect(me.flags).toEqual({
      customPageSize: true,
      customStylesheet: true,
      bannerImages: true,
      backgroundImage: true,
      customFonts: true,
    });
  });

  it('a Premium Entitlement opens the same flags as Pro', async () => {
    const { app, db } = makeApp();
    const email = `u${Math.random().toString(36).slice(2)}@test.dev`;
    const cookie = await registerViaApi(app, email);
    grant(db, email, 'premium', 30);

    const me = (await (await getMe(app, cookie)).json()) as MeResponse;
    expect(me.plan).toBe('premium');
    expect(me.flags.customPageSize).toBe(true);
    expect(me.flags.customFonts).toBe(true);
  });

  it('an expired Entitlement re-locks: no plan, no plan quota', async () => {
    const { app, db } = makeApp();
    const email = `u${Math.random().toString(36).slice(2)}@test.dev`;
    const cookie = await registerViaApi(app, email);
    grant(db, email, 'premium', -1);

    const me = (await (await getMe(app, cookie)).json()) as MeResponse;
    expect(me.plan).toBeNull();
    expect(me.expiresAt).toBeNull();
    expect(me.quota).toEqual({ used: 0, limit: 0 });
    // Expiry re-locks the gates (billing/04 acceptance): no plan, no flags.
    expect(Object.values(me.flags).every((open) => !open)).toBe(true);
  });

  it('comp allowance without a plan grants no feature flags', async () => {
    const { app, db } = makeApp();
    const email = `u${Math.random().toString(36).slice(2)}@test.dev`;
    const cookie = await registerViaApi(app, email);
    const userId = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .get()!.id;
    // billing/03: comping grants Server Exports without a plan — the flags
    // stay locked, since the gate is the plan, not the allowance (server/04).
    db.insert(exportUsage)
      .values({ userId, period: usagePeriod(new Date()), count: 0, comps: 5 })
      .run();

    const me = (await (await getMe(app, cookie)).json()) as MeResponse;
    expect(me.plan).toBeNull();
    expect(me.quota).toEqual({ used: 0, limit: 5 });
    expect(Object.values(me.flags).every((open) => !open)).toBe(true);
  });

  it('reports the period usage and includes comps in the limit', async () => {
    const { app, db } = makeApp();
    const email = `u${Math.random().toString(36).slice(2)}@test.dev`;
    const cookie = await registerViaApi(app, email);
    grant(db, email, 'pro', 30);
    const userId = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .get()!.id;
    db.insert(exportUsage)
      .values({ userId, period: usagePeriod(new Date()), count: 7, comps: 5 })
      .run();

    const me = (await (await getMe(app, cookie)).json()) as MeResponse;
    expect(me.quota).toEqual({ used: 7, limit: 305 });
  });

  it("last period's usage does not carry into the limit or used", async () => {
    const { app, db } = makeApp();
    const email = `u${Math.random().toString(36).slice(2)}@test.dev`;
    const cookie = await registerViaApi(app, email);
    grant(db, email, 'pro', 30);
    const userId = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .get()!.id;
    const lastMonth = new Date();
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    db.insert(exportUsage)
      .values({
        userId,
        period: usagePeriod(lastMonth),
        count: 299,
        comps: 40,
      })
      .run();

    const me = (await (await getMe(app, cookie)).json()) as MeResponse;
    expect(me.quota).toEqual({ used: 0, limit: 300 });
  });

  it('flags the admin account', async () => {
    const { app } = makeApp({ adminEmail: 'boss@test.dev' });
    const cookie = await registerViaApi(app, 'boss@test.dev');

    const me = (await (await getMe(app, cookie)).json()) as MeResponse;
    expect(me.isAdmin).toBe(true);
  });
});

describe('GET /api/me — AI state (ai-transforms/03)', () => {
  /** A configured instance: key in the environment and a model chosen. */
  function configureAi(db: AppDatabase, model = 'vendor/model'): void {
    setSetting(db, AI_PROVIDER_KEY, {
      ...DEFAULT_AI_PROVIDER_CONFIG,
      model,
    });
  }

  async function meFor(
    options: Parameters<typeof makeApp>[0] = {},
    setup?: (db: AppDatabase, email: string) => void,
  ): Promise<{ me: MeResponse; db: AppDatabase }> {
    const { app, db } = makeApp({ now: () => NOW, ...options });
    const email = `u${Math.random().toString(36).slice(2)}@test.dev`;
    const cookie = await registerViaApi(app, email);
    if (options.ai?.apiKey) configureAi(db);
    setup?.(db, email);
    const me = (await (await getMe(app, cookie)).json()) as MeResponse;
    return { me, db };
  }

  it('reports configured, included, and the remaining allowance for a paid caller', async () => {
    const { me } = await meFor({ ai: { apiKey: 'test-key' } }, (db, email) => {
      grant(db, email, 'pro', 30);
      const userId = db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .get()!.id;
      db.insert(aiUsage).values({ userId, period: '2026-09', count: 7 }).run();
    });

    expect(me.ai).toEqual({
      configured: true,
      included: true,
      access: true,
      disclosureSeen: false,
      maxInputCharacters: 60_000,
      allowance: 100,
      remaining: 93,
      period: '2026-09',
      resetsAt: '2026-10-01T00:00:00.000Z',
    });
  });

  it('keeps the AI counter separate from the Server Export quota', async () => {
    const { me } = await meFor({ ai: { apiKey: 'test-key' } }, (db, email) => {
      grant(db, email, 'pro', 30);
      const userId = db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .get()!.id;
      db.insert(exportUsage)
        .values({ userId, period: '2026-09', count: 9, comps: 5 })
        .run();
      db.insert(aiUsage).values({ userId, period: '2026-09', count: 2 }).run();
    });

    expect(me.quota).toEqual({ used: 9, limit: 305 });
    expect(me.ai.remaining).toBe(98);
  });

  it('reports the instance unconfigured when the environment has no key', async () => {
    const { me } = await meFor({}, (db, email) => {
      grant(db, email, 'premium', 30);
      configureAi(db);
    });
    // The plan still includes AI; the instance cannot serve it, and nothing
    // user-facing may upsell what the operator cannot deliver.
    expect(me.ai.configured).toBe(false);
    expect(me.ai.included).toBe(true);
  });

  it('the kill switch disables AI even with a key present', async () => {
    const { me } = await meFor({ ai: { apiKey: 'test-key' } }, (db, email) => {
      grant(db, email, 'pro', 30);
      setSetting(db, AI_PROVIDER_KEY, {
        ...DEFAULT_AI_PROVIDER_CONFIG,
        model: 'vendor/model',
        enabled: false,
      });
    });
    expect(me.ai.configured).toBe(false);
  });

  it('an unchosen model leaves AI unconfigured', async () => {
    const { me } = await meFor({ ai: { apiKey: 'test-key' } }, (db, email) => {
      grant(db, email, 'pro', 30);
      // The seeded default: enabled with an empty model.
      configureAi(db, '');
    });
    expect(me.ai.configured).toBe(false);
  });

  it('a zero allowance means the plan does not include AI', async () => {
    const { me } = await meFor({ ai: { apiKey: 'test-key' } }, (db, email) => {
      grant(db, email, 'pro', 30);
      setSetting(db, LIMITS_KEY, {
        pro: { pageCap: 300, quotaMonthly: 300, aiActionsMonthly: 0 },
        premium: { pageCap: 1000, quotaMonthly: 1000, aiActionsMonthly: 300 },
      });
    });
    expect(me.ai.included).toBe(false);
    expect(me.ai.remaining).toBe(0);
  });

  it('an expired plan stops including AI even with usage on file', async () => {
    const { me } = await meFor({ ai: { apiKey: 'test-key' } }, (db, email) => {
      const userId = db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .get()!.id;
      // Expired relative to the injected NOW (2026-09-11), not wall time.
      db.insert(entitlements)
        .values({
          userId,
          plan: 'pro',
          expiresAt: new Date('2026-08-01T00:00:00.000Z'),
        })
        .run();
      db.insert(aiUsage).values({ userId, period: '2026-09', count: 3 }).run();
    });
    expect(me.ai.included).toBe(false);
    expect(me.ai.remaining).toBe(0);
  });

  it("reports the caller's AI Access switch", async () => {
    const { me } = await meFor({ ai: { apiKey: 'test-key' } }, (db, email) => {
      grant(db, email, 'pro', 30);
      db.update(users)
        .set({ aiAccess: false })
        .where(eq(users.email, email))
        .run();
    });
    expect(me.ai.access).toBe(false);
  });

  it("last period's AI usage does not carry into remaining", async () => {
    const { me } = await meFor({ ai: { apiKey: 'test-key' } }, (db, email) => {
      grant(db, email, 'premium', 30);
      const userId = db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .get()!.id;
      db.insert(aiUsage)
        .values({ userId, period: '2026-08', count: 299 })
        .run();
    });
    expect(me.ai.remaining).toBe(300);
  });
});
