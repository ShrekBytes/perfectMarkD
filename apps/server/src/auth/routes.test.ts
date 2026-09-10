import { afterEach, describe, expect, it } from 'vitest';
import { createApp, type AppType } from '../index.js';
import { createTestDatabase, removeTestDatabase } from '../db/testing.js';

const SESSION_SECRET = 'test-session-secret';

let cleanup: (() => void) | undefined;
let current = new Date('2026-09-11T00:00:00Z');

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  current = new Date('2026-09-11T00:00:00Z');
});

function makeApp(
  options: Partial<Parameters<typeof createApp>[0]> = {},
): AppType {
  const { db, dir } = createTestDatabase();
  cleanup = () => removeTestDatabase(dir);
  return createApp({
    db,
    log: () => {},
    sessionSecret: SESSION_SECRET,
    ...options,
  });
}

function postJson(
  app: AppType,
  path: string,
  body: unknown,
  options: { cookie?: string; headers?: Record<string, string> } = {},
) {
  return app.request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...options.headers,
    },
    body: JSON.stringify(body),
  });
}

/** The `pmd_session=...` pair from a Set-Cookie header, for replaying requests. */
function sessionCookie(res: Response): string {
  const header = res.headers.get('set-cookie');
  if (!header) throw new Error('no set-cookie header');
  const pair = header.split(';')[0];
  if (!pair) throw new Error(`malformed set-cookie: ${header}`);
  return pair;
}

describe('POST /api/auth/register', () => {
  it('creates the account and starts a session', async () => {
    const app = makeApp();

    const res = await postJson(app, '/api/auth/register', {
      email: 'reader@example.com',
      password: 'correct horse battery',
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      user: { email: 'reader@example.com', isAdmin: false },
    });

    const me = await app.request('/api/auth/me', {
      headers: { cookie: sessionCookie(res) },
    });
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({
      user: { email: 'reader@example.com', isAdmin: false },
    });
  });

  it('sets an httpOnly, SameSite=Lax, 30-day session cookie', async () => {
    const app = makeApp();

    const res = await postJson(app, '/api/auth/register', {
      email: 'reader@example.com',
      password: 'correct horse battery',
    });

    const header = res.headers.get('set-cookie');
    expect(header).toMatch(/^pmd_session=[A-Za-z0-9_-]{20,}/);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Path=/');
    expect(header).toContain('Max-Age=2592000');
  });

  it('adds Secure only when the request arrived over HTTPS (proxy header)', async () => {
    const app = makeApp();
    const body = JSON.stringify({
      email: 'reader@example.com',
      password: 'correct horse battery',
    });

    const plain = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    expect(plain.headers.get('set-cookie')).not.toContain('Secure');

    const tls = await app.request('/api/auth/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-proto': 'https',
      },
      body: JSON.stringify({
        email: 'other@example.com',
        password: 'correct horse battery',
      }),
    });
    expect(tls.headers.get('set-cookie')).toContain('Secure');
  });

  it('normalizes the email to lowercase', async () => {
    const app = makeApp();

    await postJson(app, '/api/auth/register', {
      email: 'Reader@Example.COM',
      password: 'correct horse battery',
    });
    const res = await postJson(app, '/api/auth/login', {
      email: 'reader@example.com',
      password: 'correct horse battery',
    });

    expect(res.status).toBe(200);
  });

  it('rejects a duplicate email with 409', async () => {
    const app = makeApp();

    await postJson(app, '/api/auth/register', {
      email: 'reader@example.com',
      password: 'correct horse battery',
    });
    const res = await postJson(app, '/api/auth/register', {
      email: 'reader@example.com',
      password: 'another password',
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: expect.any(String) });
  });

  it('turns a duplicate that races the email check into 409, not 500', async () => {
    const app = makeApp();

    const [first, second] = await Promise.all([
      postJson(app, '/api/auth/register', {
        email: 'racer@example.com',
        password: 'correct horse battery',
      }),
      postJson(app, '/api/auth/register', {
        email: 'racer@example.com',
        password: 'another good password',
      }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it('rejects a malformed email and a short password with 400 and a message', async () => {
    const app = makeApp();

    const badEmail = await postJson(app, '/api/auth/register', {
      email: 'not-an-email',
      password: 'correct horse battery',
    });
    expect(badEmail.status).toBe(400);
    expect(await badEmail.json()).toMatchObject({ error: expect.any(String) });

    const shortPassword = await postJson(app, '/api/auth/register', {
      email: 'reader@example.com',
      password: 'short',
    });
    expect(shortPassword.status).toBe(400);
    expect(await shortPassword.json()).toMatchObject({
      error: expect.any(String),
    });
  });
});

describe('POST /api/auth/login', () => {
  async function register(app: AppType, email = 'reader@example.com') {
    await postJson(app, '/api/auth/register', {
      email,
      password: 'correct horse battery',
    });
  }

  it('starts a session for valid credentials', async () => {
    const app = makeApp();
    await register(app);

    const res = await postJson(app, '/api/auth/login', {
      email: 'reader@example.com',
      password: 'correct horse battery',
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: { email: 'reader@example.com', isAdmin: false },
    });
    const me = await app.request('/api/auth/me', {
      headers: { cookie: sessionCookie(res) },
    });
    expect(me.status).toBe(200);
  });

  it('rejects a wrong password and an unknown email the same way', async () => {
    const app = makeApp();
    await register(app);

    const wrongPassword = await postJson(app, '/api/auth/login', {
      email: 'reader@example.com',
      password: 'the wrong password',
    });
    expect(wrongPassword.status).toBe(401);
    const wrongBody = await wrongPassword.json();
    expect(wrongBody).toMatchObject({ error: expect.any(String) });

    const unknownEmail = await postJson(app, '/api/auth/login', {
      email: 'nobody@example.com',
      password: 'correct horse battery',
    });
    expect(unknownEmail.status).toBe(401);
    expect(await unknownEmail.json()).toEqual(wrongBody);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the session, so /me is unauthenticated afterwards', async () => {
    const app = makeApp();
    const registered = await postJson(app, '/api/auth/register', {
      email: 'reader@example.com',
      password: 'correct horse battery',
    });
    const cookie = sessionCookie(registered);

    const res = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: { cookie },
    });
    expect(res.status).toBe(204);

    const me = await app.request('/api/auth/me', { headers: { cookie } });
    expect(me.status).toBe(401);
  });

  it('is a no-op without a session', async () => {
    const app = makeApp();
    const res = await app.request('/api/auth/logout', { method: 'POST' });
    expect(res.status).toBe(204);
  });
});

describe('POST /api/auth/change-password', () => {
  it('replaces the password and requires the current one', async () => {
    const app = makeApp();
    const registered = await postJson(app, '/api/auth/register', {
      email: 'reader@example.com',
      password: 'correct horse battery',
    });
    const cookie = sessionCookie(registered);

    const wrong = await postJson(
      app,
      '/api/auth/change-password',
      { currentPassword: 'not it at all', newPassword: 'a brand new password' },
      { cookie },
    );
    expect(wrong.status).toBe(401);

    const changed = await postJson(
      app,
      '/api/auth/change-password',
      {
        currentPassword: 'correct horse battery',
        newPassword: 'a brand new password',
      },
      { cookie },
    );
    expect(changed.status).toBe(204);

    const oldLogin = await postJson(app, '/api/auth/login', {
      email: 'reader@example.com',
      password: 'correct horse battery',
    });
    expect(oldLogin.status).toBe(401);
    const newLogin = await postJson(app, '/api/auth/login', {
      email: 'reader@example.com',
      password: 'a brand new password',
    });
    expect(newLogin.status).toBe(200);
  });

  it('revokes other sessions but keeps the one that changed the password', async () => {
    const app = makeApp();
    const first = await postJson(app, '/api/auth/register', {
      email: 'reader@example.com',
      password: 'correct horse battery',
    });
    const cookie = sessionCookie(first);

    // A second signed-in device (e.g. a stolen cookie elsewhere).
    const other = await postJson(app, '/api/auth/login', {
      email: 'reader@example.com',
      password: 'correct horse battery',
    });
    const otherCookie = sessionCookie(other);

    const changed = await postJson(
      app,
      '/api/auth/change-password',
      {
        currentPassword: 'correct horse battery',
        newPassword: 'a brand new password',
      },
      { cookie },
    );
    expect(changed.status).toBe(204);

    expect(
      (await app.request('/api/auth/me', { headers: { cookie: otherCookie } }))
        .status,
    ).toBe(401);
    expect(
      (await app.request('/api/auth/me', { headers: { cookie } })).status,
    ).toBe(200);
  });

  it('requires a session', async () => {
    const app = makeApp();
    const res = await postJson(app, '/api/auth/change-password', {
      currentPassword: 'x',
      newPassword: 'a brand new password',
    });
    expect(res.status).toBe(401);
  });
});

describe('admin bootstrap', () => {
  it('makes the first account matching ADMIN_EMAIL an admin', async () => {
    const app = makeApp({ adminEmail: 'owner@example.com' });

    const owner = await postJson(app, '/api/auth/register', {
      email: 'Owner@Example.com',
      password: 'correct horse battery',
    });
    expect(await owner.json()).toEqual({
      user: { email: 'owner@example.com', isAdmin: true },
    });

    const other = await postJson(app, '/api/auth/register', {
      email: 'reader@example.com',
      password: 'correct horse battery',
    });
    expect(await other.json()).toEqual({
      user: { email: 'reader@example.com', isAdmin: false },
    });
  });

  it('makes nobody admin when ADMIN_EMAIL is unset', async () => {
    const app = makeApp();
    const res = await postJson(app, '/api/auth/register', {
      email: 'reader@example.com',
      password: 'correct horse battery',
    });
    expect(await res.json()).toEqual({
      user: { email: 'reader@example.com', isAdmin: false },
    });
  });
});

describe('session lifetime', () => {
  it('survives a server restart (same database and secret)', async () => {
    const { db, dir } = createTestDatabase();
    cleanup = () => removeTestDatabase(dir);
    const before = createApp({
      db,
      sessionSecret: SESSION_SECRET,
      log: () => {},
    });
    const registered = await postJson(before, '/api/auth/register', {
      email: 'reader@example.com',
      password: 'correct horse battery',
    });
    const cookie = sessionCookie(registered);

    // A fresh app object over the same database models a process restart:
    // sessions live in SQLite and the cookie signature depends only on the
    // (unchanged) SESSION_SECRET.
    const after = createApp({
      db,
      sessionSecret: SESSION_SECRET,
      log: () => {},
    });
    const me = await after.request('/api/auth/me', { headers: { cookie } });
    expect(me.status).toBe(200);
  });

  it('rolls the 30-day expiry forward on each authenticated request', async () => {
    const app = makeApp({ now: () => current });
    // Register, then advance 20 days and hit /me: still valid.
    const registered = await postJson(app, '/api/auth/register', {
      email: 'reader@example.com',
      password: 'correct horse battery',
    });
    const cookie = sessionCookie(registered);

    const day = 24 * 60 * 60 * 1000;
    current = new Date(current.getTime() + 20 * day);
    expect(
      (await app.request('/api/auth/me', { headers: { cookie } })).status,
    ).toBe(200);

    // 40 days after creation but only 20 after the last use: a fixed expiry
    // would have lapsed; a rolling one survives.
    current = new Date(current.getTime() + 20 * day);
    expect(
      (await app.request('/api/auth/me', { headers: { cookie } })).status,
    ).toBe(200);
  });

  it('rejects a session once 30 days pass with no use', async () => {
    const app = makeApp({ now: () => current });
    const registered = await postJson(app, '/api/auth/register', {
      email: 'reader@example.com',
      password: 'correct horse battery',
    });
    const cookie = sessionCookie(registered);

    current = new Date(current.getTime() + 31 * 24 * 60 * 60 * 1000);
    expect(
      (await app.request('/api/auth/me', { headers: { cookie } })).status,
    ).toBe(401);
  });

  it('re-issues the browser cookie when the session rolls', async () => {
    const app = makeApp({ now: () => current });
    const registered = await postJson(app, '/api/auth/register', {
      email: 'reader@example.com',
      password: 'correct horse battery',
    });
    const cookie = sessionCookie(registered);

    // The fresh cookie needs no refresh.
    const fresh = await app.request('/api/auth/me', { headers: { cookie } });
    expect(fresh.headers.get('set-cookie')).toBeNull();

    // Past the daily roll threshold, /me refreshes the browser's 30-day clock.
    current = new Date(current.getTime() + 2 * 24 * 60 * 60 * 1000);
    const rolled = await app.request('/api/auth/me', { headers: { cookie } });
    expect(rolled.status).toBe(200);
    const refreshed = rolled.headers.get('set-cookie');
    expect(refreshed).toContain('pmd_session=');
    expect(refreshed).toContain('Max-Age=2592000');
  });
});

describe('auth rate limiting', () => {
  it('returns 429 once the per-IP login limit is exceeded', async () => {
    const app = makeApp({
      authRateLimit: { login: { limit: 2, windowMs: 60_000 } },
    });
    await postJson(app, '/api/auth/register', {
      email: 'reader@example.com',
      password: 'correct horse battery',
    });

    const attempt = () =>
      postJson(app, '/api/auth/login', {
        email: 'reader@example.com',
        password: 'the wrong password',
      });

    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);
    const limited = await attempt();
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
  });

  it('counts each IP separately', async () => {
    const app = makeApp({
      authRateLimit: { register: { limit: 1, windowMs: 60_000 } },
    });
    const first = await app.request('/api/auth/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '1.1.1.1',
      },
      body: JSON.stringify({
        email: 'one@example.com',
        password: 'correct horse battery',
      }),
    });
    expect(first.status).toBe(201);

    const secondIp = await app.request('/api/auth/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '2.2.2.2',
      },
      body: JSON.stringify({
        email: 'two@example.com',
        password: 'correct horse battery',
      }),
    });
    expect(secondIp.status).toBe(201);
  });

  it('ignores client-prepended x-forwarded-for hops', async () => {
    // The client controls the left of the header; Caddy appends the address it
    // observed. Trusting the first hop would let an attacker rotate fake IPs
    // and never hit the limit.
    const app = makeApp({
      authRateLimit: { login: { limit: 1, windowMs: 60_000 } },
    });
    const attempt = (spoofedPrefix: string) =>
      postJson(
        app,
        '/api/auth/login',
        { email: 'reader@example.com', password: 'wrong' },
        {
          headers: {
            'x-forwarded-for': `${spoofedPrefix}, 9.9.9.9`,
          },
        },
      );

    expect((await attempt('1.1.1.1')).status).toBe(401);
    expect((await attempt('2.2.2.2')).status).toBe(429);
  });
});
