import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp, type AppType } from '../index.js';
import { createTestDatabase, removeTestDatabase } from '../db/testing.js';
import type { AppDatabase } from '../db/database.js';
import {
  aiUsage,
  entitlements,
  exportUsage,
  users,
  type AiProviderConfig,
} from '../db/schema.js';
import {
  AI_PROVIDER_KEY,
  DEFAULT_AI_PROVIDER_CONFIG,
  LIMITS_KEY,
  setSetting,
} from '../db/settings.js';
import type {
  AiCompletionReply,
  AiProvider,
  AiCompletionRequest,
} from './provider.js';

const SESSION_SECRET = 'test-session-secret';
const NOW = new Date('2026-09-11T00:00:00.000Z');
const PERIOD = '2026-09';

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

/** A recording fake: every server-side AI test runs against one. */
function fakeProvider(
  complete: (request: AiCompletionRequest) => Promise<AiCompletionReply>,
): AiProvider {
  return {
    complete,
    modelInfo: async () => null,
  };
}

const okReply = (text: string): AiCompletionReply => ({
  text,
  finishReason: 'stop',
});

function makeApp(
  options: {
    apiKey?: string | null;
    provider?: AiProvider;
    burstPerMinute?: number;
    maxInputCharacters?: number;
  } = {},
): { app: AppType; db: AppDatabase } {
  const { db, dir } = createTestDatabase();
  cleanup = () => removeTestDatabase(dir);
  const app = createApp({
    db,
    log: () => {},
    sessionSecret: SESSION_SECRET,
    now: () => NOW,
    ai: {
      apiKey: options.apiKey === undefined ? 'sk-test-key' : options.apiKey,
      provider: options.provider ?? fakeProvider(async () => okReply('ok')),
    },
  });
  const config: AiProviderConfig = {
    ...DEFAULT_AI_PROVIDER_CONFIG,
    model: 'vendor/model',
    ...(options.burstPerMinute === undefined
      ? {}
      : { burstPerMinute: options.burstPerMinute }),
    ...(options.maxInputCharacters === undefined
      ? {}
      : { maxInputCharacters: options.maxInputCharacters }),
  };
  setSetting(db, AI_PROVIDER_KEY, config);
  return { app, db };
}

function postJson(app: AppType, path: string, body: unknown, cookie?: string) {
  return app.request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function putJson(app: AppType, path: string, body: unknown, cookie?: string) {
  return app.request(path, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function sessionCookie(res: Response): string {
  const header = res.headers.get('set-cookie');
  if (!header) throw new Error('no set-cookie header');
  return header.split(';')[0]!;
}

async function registerUser(
  app: AppType,
  db: AppDatabase,
): Promise<{ cookie: string; userId: number }> {
  const email = `u${Math.random().toString(36).slice(2)}@test.dev`;
  const res = await postJson(app, '/api/auth/register', {
    email,
    password: 'correct horse battery staple',
  });
  expect(res.status).toBe(201);
  const cookie = sessionCookie(res);
  const userId = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .get()!.id;
  return { cookie, userId };
}

/** Registers through the real auth flow, grants a plan, returns the cookie. */
async function paidUser(
  app: AppType,
  db: AppDatabase,
  plan: 'pro' | 'premium' = 'pro',
): Promise<{ cookie: string; userId: number }> {
  const { cookie, userId } = await registerUser(app, db);
  db.insert(entitlements)
    .values({ userId, plan, expiresAt: new Date('2027-01-01T00:00:00.000Z') })
    .run();
  return { cookie, userId };
}

const MARKDOWN_BODY = {
  instruction: 'Make it friendlier',
  target: { kind: 'selection', text: 'Hello world', from: 0, to: 11 },
};

const ANCHORED_REPLY = `<<<<<<< SEARCH
Hello
=======
Hi
>>>>>>> REPLACE`;

const STYLESHEET_BODY = {
  instruction: 'Warmer accent',
  css: '.mpdf-doc h1 { color: black; }',
};

async function aiUsageCount(db: AppDatabase, userId: number): Promise<number> {
  return (
    db
      .select({ count: aiUsage.count })
      .from(aiUsage)
      .where(eq(aiUsage.userId, userId))
      .get()?.count ?? 0
  );
}

describe('POST /api/ai/markdown — gates', () => {
  it('answers 401 when signed out', async () => {
    const { app } = makeApp();
    const res = await postJson(app, '/api/ai/markdown', MARKDOWN_BODY);
    expect(res.status).toBe(401);
  });

  it('refuses an unconfigured instance without an upsell', async () => {
    const { app, db } = makeApp({ apiKey: null });
    const { cookie } = await paidUser(app, db);
    const res = await postJson(app, '/api/ai/markdown', MARKDOWN_BODY, cookie);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'ai_not_configured' });
  });

  it('refuses a caller whose plan does not include AI', async () => {
    const { app, db } = makeApp();
    const { cookie } = await registerUser(app, db);
    const res = await postJson(app, '/api/ai/markdown', MARKDOWN_BODY, cookie);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'ai_not_entitled' });
  });

  it('a zero allowance is the same refusal as no plan', async () => {
    const { app, db } = makeApp();
    const { cookie } = await paidUser(app, db, 'pro');
    setSetting(db, LIMITS_KEY, {
      pro: { pageCap: 300, quotaMonthly: 300, aiActionsMonthly: 0 },
      premium: { pageCap: 1000, quotaMonthly: 1000, aiActionsMonthly: 300 },
    });
    const res = await postJson(app, '/api/ai/markdown', MARKDOWN_BODY, cookie);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'ai_not_entitled' });
  });

  it('refuses when AI Access is off', async () => {
    const { app, db } = makeApp();
    const { cookie, userId } = await paidUser(app, db);
    db.update(users).set({ aiAccess: false }).where(eq(users.id, userId)).run();
    const res = await postJson(app, '/api/ai/markdown', MARKDOWN_BODY, cookie);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'ai_access_off' });
  });

  it('refuses when the allowance is spent, naming the period and reset', async () => {
    const { app, db } = makeApp();
    const { cookie, userId } = await paidUser(app, db);
    db.insert(aiUsage).values({ userId, period: PERIOD, count: 100 }).run();
    const res = await postJson(app, '/api/ai/markdown', MARKDOWN_BODY, cookie);
    expect(res.status).toBe(402);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe('ai_allowance_exhausted');
    expect(body.error).toContain('2026-10-01');
  });

  it('enforces the per-minute burst limit', async () => {
    const { app, db } = makeApp({ burstPerMinute: 1 });
    const { cookie } = await paidUser(app, db);
    const first = await postJson(
      app,
      '/api/ai/markdown',
      MARKDOWN_BODY,
      cookie,
    );
    expect(first.status).toBe(200);
    const second = await postJson(
      app,
      '/api/ai/markdown',
      MARKDOWN_BODY,
      cookie,
    );
    expect(second.status).toBe(429);
    expect(await second.json()).toMatchObject({ code: 'ai_burst_limit' });
  });

  it('refuses a target past the input cap', async () => {
    const { app, db } = makeApp({ maxInputCharacters: 5 });
    const { cookie } = await paidUser(app, db);
    const res = await postJson(app, '/api/ai/markdown', MARKDOWN_BODY, cookie);
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: 'ai_input_too_long' });
  });

  it('validates the request body', async () => {
    const { app, db } = makeApp();
    const { cookie } = await paidUser(app, db);
    const res = await postJson(
      app,
      '/api/ai/markdown',
      { instruction: '  ', target: { kind: 'selection', text: 'x' } },
      cookie,
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/ai/markdown — the provider and metering', () => {
  it('returns anchored edits for a whole document and counts one Action', async () => {
    const calls: AiCompletionRequest[] = [];
    const { app, db } = makeApp({
      provider: fakeProvider(async (request) => {
        calls.push(request);
        return okReply(ANCHORED_REPLY);
      }),
    });
    const { cookie, userId } = await paidUser(app, db);

    const res = await postJson(
      app,
      '/api/ai/markdown',
      {
        instruction: 'Shorten it',
        target: { kind: 'document', text: 'Hello world', from: 0, to: 11 },
      },
      cookie,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      proposal: { kind: string; edits: unknown };
      remaining: number;
    };
    expect(body.proposal).toEqual({
      kind: 'anchored',
      edits: [{ search: 'Hello', replace: 'Hi' }],
    });
    expect(body.remaining).toBe(99);
    expect(await aiUsageCount(db, userId)).toBe(1);

    // The request carried an explicit output cap and a system prompt.
    expect(calls[0]?.maxOutputTokens).toBe(
      DEFAULT_AI_PROVIDER_CONFIG.maxOutputTokens,
    );
    expect(calls[0]?.messages[0]?.content).toContain('anchored edit');
  });

  it('returns a replacement for a selection', async () => {
    const { app, db } = makeApp({
      provider: fakeProvider(async () => okReply('  Hi there  ')),
    });
    const { cookie } = await paidUser(app, db);
    const res = await postJson(app, '/api/ai/markdown', MARKDOWN_BODY, cookie);
    const body = (await res.json()) as { proposal: unknown };
    expect(body.proposal).toEqual({ kind: 'replace', text: 'Hi there' });
  });

  it('generates from an empty document (replacement contract)', async () => {
    const { app, db } = makeApp({
      provider: fakeProvider(async () => okReply('```\n# Brief\n```')),
    });
    const { cookie } = await paidUser(app, db);
    const res = await postJson(
      app,
      '/api/ai/markdown',
      {
        instruction: 'Write a brief',
        target: { kind: 'document', text: '', from: 0, to: 0 },
      },
      cookie,
    );
    const body = (await res.json()) as { proposal: unknown };
    expect(body.proposal).toEqual({ kind: 'replace', text: '# Brief' });
  });

  it('maps a provider failure without leaking upstream detail or counting it', async () => {
    const { app, db } = makeApp({
      provider: fakeProvider(async () => {
        const { AiProviderError } = await import('./provider.js');
        throw new AiProviderError(
          'http',
          'Upstream says no.',
          429,
          'vendor body',
        );
      }),
    });
    const { cookie, userId } = await paidUser(app, db);
    const res = await postJson(app, '/api/ai/markdown', MARKDOWN_BODY, cookie);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe('ai_provider_error');
    expect(body.error).not.toContain('Upstream');
    expect(body.error).not.toContain('vendor');
    expect(await aiUsageCount(db, userId)).toBe(0);
  });

  it('refuses a truncated reply and consumes no allowance', async () => {
    const { app, db } = makeApp({
      provider: fakeProvider(async () => ({
        text: ANCHORED_REPLY,
        finishReason: 'length',
      })),
    });
    const { cookie, userId } = await paidUser(app, db);
    const res = await postJson(app, '/api/ai/markdown', MARKDOWN_BODY, cookie);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: 'ai_truncated' });
    expect(await aiUsageCount(db, userId)).toBe(0);
  });

  it('refuses an empty reply and consumes no allowance', async () => {
    const { app, db } = makeApp({
      provider: fakeProvider(async () => okReply('   ')),
    });
    const { cookie, userId } = await paidUser(app, db);
    const res = await postJson(app, '/api/ai/markdown', MARKDOWN_BODY, cookie);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: 'ai_invalid_response' });
    expect(await aiUsageCount(db, userId)).toBe(0);
  });

  it('refuses a whole-document reply with no blocks', async () => {
    const { app, db } = makeApp({
      provider: fakeProvider(async () =>
        okReply('I could not find anything to change.'),
      ),
    });
    const { cookie, userId } = await paidUser(app, db);
    const res = await postJson(
      app,
      '/api/ai/markdown',
      {
        instruction: 'Fix typos',
        target: { kind: 'document', text: 'Hello world', from: 0, to: 11 },
      },
      cookie,
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: 'ai_invalid_response' });
    expect(await aiUsageCount(db, userId)).toBe(0);
  });

  it('refuses an ambiguous anchor rather than applying the rest', async () => {
    const { app, db } = makeApp({
      provider: fakeProvider(async () => okReply(ANCHORED_REPLY)),
    });
    const { cookie, userId } = await paidUser(app, db);
    const res = await postJson(
      app,
      '/api/ai/markdown',
      {
        instruction: 'Fix it',
        target: { kind: 'document', text: 'Hello Hello', from: 0, to: 11 },
      },
      cookie,
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: 'ai_invalid_response' });
    expect(await aiUsageCount(db, userId)).toBe(0);
  });

  it('records the first-use disclosure once, on the first Action only', async () => {
    const { app, db } = makeApp({
      provider: fakeProvider(async () => okReply('Hi')),
    });
    const { cookie, userId } = await paidUser(app, db);
    const first = await postJson(
      app,
      '/api/ai/markdown',
      MARKDOWN_BODY,
      cookie,
    );
    expect(first.status).toBe(200);
    expect(
      db
        .select({ seen: users.aiDisclosureSeen })
        .from(users)
        .where(eq(users.id, userId))
        .get()?.seen,
    ).toBe(true);
  });

  it('keeps the AI counter separate from the Server Export quota', async () => {
    const { app, db } = makeApp({
      provider: fakeProvider(async () => okReply('Hi')),
    });
    const { cookie, userId } = await paidUser(app, db);
    db.insert(exportUsage)
      .values({ userId, period: PERIOD, count: 4, comps: 0 })
      .run();
    await postJson(app, '/api/ai/markdown', MARKDOWN_BODY, cookie);
    expect(
      db
        .select({ count: exportUsage.count })
        .from(exportUsage)
        .where(eq(exportUsage.userId, userId))
        .get()?.count,
    ).toBe(4);
    expect(await aiUsageCount(db, userId)).toBe(1);
  });
});

describe('POST /api/ai/stylesheet', () => {
  it('returns the rewritten stylesheet and uses the stylesheet model when set', async () => {
    const models: string[] = [];
    const { app, db } = makeApp({
      provider: fakeProvider(async (request) => {
        models.push(request.model);
        return okReply('.mpdf-doc h1 { color: #c00; }');
      }),
    });
    setSetting(db, AI_PROVIDER_KEY, {
      ...DEFAULT_AI_PROVIDER_CONFIG,
      model: 'vendor/model',
      stylesheetModel: 'vendor/cheap',
    });
    const { cookie } = await paidUser(app, db);
    const res = await postJson(
      app,
      '/api/ai/stylesheet',
      STYLESHEET_BODY,
      cookie,
    );
    const body = (await res.json()) as { proposal: unknown };
    expect(body.proposal).toEqual({
      kind: 'replace',
      text: '.mpdf-doc h1 { color: #c00; }',
    });
    expect(models).toEqual(['vendor/cheap']);
  });

  it('replays the last three exchanges and the box as it stands now', async () => {
    const calls: AiCompletionRequest[] = [];
    const { app, db } = makeApp({
      provider: fakeProvider(async (request) => {
        calls.push(request);
        return okReply('.mpdf-doc h1 { border-width: 1px; }');
      }),
    });
    const { cookie } = await paidUser(app, db);
    const res = await postJson(
      app,
      '/api/ai/stylesheet',
      {
        instruction: 'Not like that — thinner rules',
        css: '.mpdf-doc h1 { border-width: 3px; }',
        history: [
          { instruction: 'One', reply: 'a {}' },
          { instruction: 'Two', reply: 'b {}' },
          { instruction: 'Three', reply: 'c {}' },
          { instruction: 'Four', reply: 'd {}' },
        ],
      },
      cookie,
    );
    expect(res.status).toBe(200);
    const contents = calls[0]!.messages.map((message) => message.content);
    expect(calls[0]!.messages[0]!.role).toBe('system');
    // Only the last three turns ride along; the oldest is dropped.
    expect(contents.join('\n')).not.toContain('Instruction: One');
    expect(contents).toContain('Instruction: Two');
    // The request carries the box's current text, so a hand edit wins over
    // any earlier reply.
    expect(contents.at(-1)).toContain('.mpdf-doc h1 { border-width: 3px; }');
  });

  it('accepts a request with no history at all', async () => {
    const { app, db } = makeApp({
      provider: fakeProvider(async () => okReply('h1 { color: red; }')),
    });
    const { cookie } = await paidUser(app, db);
    const res = await postJson(
      app,
      '/api/ai/stylesheet',
      STYLESHEET_BODY,
      cookie,
    );
    expect(res.status).toBe(200);
  });

  it('refuses a malformed history', async () => {
    const { app, db } = makeApp();
    const { cookie } = await paidUser(app, db);
    for (const history of ['not a list', [{ instruction: 'One' }], [42]]) {
      const res = await postJson(
        app,
        '/api/ai/stylesheet',
        { ...STYLESHEET_BODY, history },
        cookie,
      );
      expect(res.status).toBe(400);
    }
  });

  it('refuses a stylesheet with no usable reply, counting nothing', async () => {
    const { app, db } = makeApp({
      provider: fakeProvider(async () => okReply('   ')),
    });
    const { cookie, userId } = await paidUser(app, db);
    const res = await postJson(
      app,
      '/api/ai/stylesheet',
      STYLESHEET_BODY,
      cookie,
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: 'ai_invalid_response' });
    expect(await aiUsageCount(db, userId)).toBe(0);
  });
});

describe('PUT /api/ai/access', () => {
  it('toggles AI Access and reports the new state', async () => {
    const { app, db } = makeApp();
    const { cookie, userId } = await paidUser(app, db);
    const off = await putJson(app, '/api/ai/access', { access: false }, cookie);
    expect(off.status).toBe(200);
    const offBody = (await off.json()) as { ai: { access: boolean } };
    expect(offBody.ai.access).toBe(false);
    expect(
      db
        .select({ access: users.aiAccess })
        .from(users)
        .where(eq(users.id, userId))
        .get()?.access,
    ).toBe(false);

    const on = await putJson(app, '/api/ai/access', { access: true }, cookie);
    expect(((await on.json()) as { ai: { access: boolean } }).ai.access).toBe(
      true,
    );
  });

  it('rejects a missing or non-boolean value', async () => {
    const { app, db } = makeApp();
    const { cookie } = await paidUser(app, db);
    const res = await putJson(app, '/api/ai/access', { access: 'yes' }, cookie);
    expect(res.status).toBe(400);
  });

  it('answers 401 when signed out', async () => {
    const { app } = makeApp();
    const res = await putJson(app, '/api/ai/access', { access: true });
    expect(res.status).toBe(401);
  });
});
