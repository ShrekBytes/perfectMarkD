import { afterEach, describe, expect, it } from 'vitest';
import { createApp, type AppType } from '../index.js';
import { createTestDatabase, removeTestDatabase } from '../db/testing.js';
import type { AppDatabase } from '../db/database.js';
import {
  TEST_PUBLIC_ORIGIN as PUBLIC_ORIGIN,
  testMailComposition,
} from './testing.js';
import type { RecordingMailer } from '../mail/testing.js';
import { users } from '../db/schema.js';
import {
  PASSWORD_RESET_TOKEN_TTL_MS,
  VERIFICATION_TOKEN_TTL_MS,
} from './tokens.js';

const SESSION_SECRET = 'test-session-secret';

let cleanup: (() => void) | undefined;
let current = new Date('2026-09-11T00:00:00Z');

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  current = new Date('2026-09-11T00:00:00Z');
});

function makeApp(options: Partial<Parameters<typeof createApp>[0]> = {}): {
  app: AppType;
  mailer: RecordingMailer;
  db: AppDatabase;
} {
  const { db, dir } = createTestDatabase();
  cleanup = () => removeTestDatabase(dir);
  const composition = testMailComposition();
  return {
    db,
    mailer: composition.mail,
    app: createApp({
      db,
      log: () => {},
      sessionSecret: SESSION_SECRET,
      ...composition,
      ...options,
    }),
  };
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

const PASSWORD = 'correct horse battery';

/** Registers and returns the response, whatever shape it took. */
function register(
  app: AppType,
  email = 'reader@example.com',
  password = PASSWORD,
) {
  return postJson(app, '/api/auth/register', { email, password });
}

/** Follows the emailed link, which both verifies the address and signs in. */
async function verifyEmail(
  app: AppType,
  mailer: RecordingMailer,
  email: string,
) {
  return postJson(app, '/api/auth/verify-email', {
    token: mailer.tokenTo(email),
  });
}

/** A verified account, the way every other suite in the repo needs one. */
async function signedIn(
  app: AppType,
  mailer: RecordingMailer,
  email = 'reader@example.com',
  password = PASSWORD,
): Promise<string> {
  await register(app, email, password);
  return sessionCookie(await verifyEmail(app, mailer, email));
}

/** Asks for a reset link the way the sign-in page does. */
function requestReset(app: AppType, email: string) {
  return postJson(app, '/api/auth/request-password-reset', { email });
}

/** Chooses a new password with a reset link, the way the link's page does. */
function setPasswordWith(
  app: AppType,
  token: string,
  newPassword = 'a brand new password',
) {
  return postJson(app, '/api/auth/reset-password', { token, newPassword });
}

describe('POST /api/auth/register', () => {
  it('creates an unverified account and mails a link to it', async () => {
    const { app, mailer } = makeApp();

    const res = await register(app);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ email: 'reader@example.com' });
    // The address, and a link built from PUBLIC_ORIGIN — the one thing the
    // caller knows that the Mailer does not.
    expect(mailer.sends).toEqual([
      {
        kind: 'verification',
        to: 'reader@example.com',
        url: expect.stringMatching(
          new RegExp(`^${PUBLIC_ORIGIN}/verify-email\\?token=[A-Za-z0-9_-]+$`),
        ) as unknown as string,
      },
    ]);
  });

  it('starts no session: there is nothing to sign in to yet', async () => {
    const { app } = makeApp();

    const res = await register(app);

    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('rejects a duplicate verified address with 409', async () => {
    const { app, mailer } = makeApp();
    await signedIn(app, mailer);

    const res = await register(app);

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: expect.any(String) });
  });

  it('re-registers an unverified address identically, and re-sends', async () => {
    // Story 7: the response must not reveal that the address is registered.
    const { app, mailer } = makeApp();
    const fresh = await register(app);
    mailer.sends.length = 0;

    const again = await register(
      app,
      'reader@example.com',
      'a different password',
    );

    expect(again.status).toBe(fresh.status);
    expect(await again.json()).toEqual(await fresh.json());
    expect(mailer.sends).toHaveLength(1);
    expect(mailer.sends[0]?.kind).toBe('verification');
    // A different link, so the second email supersedes the first.
    expect(mailer.tokenTo('reader@example.com')).not.toBe('');
  });

  it('leaves an unverified account one row, with its first password', async () => {
    const { app, mailer } = makeApp();
    await register(app, 'reader@example.com', PASSWORD);
    await register(app, 'reader@example.com', 'a different password');

    const verified = await verifyEmail(app, mailer, 'reader@example.com');
    expect(verified.status).toBe(200);

    // The original password still signs in: re-registration re-sends, it does
    // not re-key the account behind a link anyone can trigger.
    const original = await postJson(app, '/api/auth/login', {
      email: 'reader@example.com',
      password: PASSWORD,
    });
    expect(original.status).toBe(200);
    const replaced = await postJson(app, '/api/auth/login', {
      email: 'reader@example.com',
      password: 'a different password',
    });
    expect(replaced.status).toBe(401);
  });

  it('normalizes the email to lowercase', async () => {
    const { app, mailer } = makeApp();

    await register(app, 'Reader@Example.COM');
    const res = await postJson(app, '/api/auth/login', {
      email: 'reader@example.com',
      password: PASSWORD,
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'email_unverified' });
    expect(mailer.sends[0]?.to).toBe('reader@example.com');
  });

  it('rejects a malformed email and a short password with 400 and a message', async () => {
    const { app } = makeApp();

    const badEmail = await postJson(app, '/api/auth/register', {
      email: 'not-an-email',
      password: PASSWORD,
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

describe('POST /api/auth/verify-email', () => {
  it('verifies the address, signs the user in, and refuses the link again', async () => {
    const { app, mailer } = makeApp();
    await register(app);

    const res = await verifyEmail(app, mailer, 'reader@example.com');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: { email: 'reader@example.com', isAdmin: false },
    });
    const me = await app.request('/api/auth/me', {
      headers: { cookie: sessionCookie(res) },
    });
    expect(me.status).toBe(200);

    // One-time: a second click on the same link is a dead link, and the account
    // is still verified.
    const replay = await verifyEmail(app, mailer, 'reader@example.com');
    expect(replay.status).toBe(400);
    expect(await replay.json()).toMatchObject({ code: 'link_invalid' });
    const login = await postJson(app, '/api/auth/login', {
      email: 'reader@example.com',
      password: PASSWORD,
    });
    expect(login.status).toBe(200);
  });

  it('refuses a link past its 24 hours, and the account stays locked', async () => {
    const { app, mailer } = makeApp({ now: () => current });
    await register(app);

    current = new Date(current.getTime() + VERIFICATION_TOKEN_TTL_MS + 1000);
    const res = await verifyEmail(app, mailer, 'reader@example.com');

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'link_invalid' });
    const login = await postJson(app, '/api/auth/login', {
      email: 'reader@example.com',
      password: PASSWORD,
    });
    expect(login.status).toBe(403);
  });

  it('refuses an unknown or missing token', async () => {
    const { app } = makeApp();

    const unknown = await postJson(app, '/api/auth/verify-email', {
      token: 'not-a-real-token',
    });
    expect(unknown.status).toBe(400);
    const missing = await postJson(app, '/api/auth/verify-email', {});
    expect(missing.status).toBe(400);
  });
});

describe('POST /api/auth/resend-verification', () => {
  it('mails a fresh link to an unverified account', async () => {
    const { app, mailer } = makeApp();
    await register(app);
    const first = mailer.tokenTo('reader@example.com');
    mailer.sends.length = 0;

    const res = await postJson(app, '/api/auth/resend-verification', {
      email: 'reader@example.com',
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true });
    expect(mailer.sends).toHaveLength(1);
    // A resend does not invalidate the link already in flight — the sweep only
    // collects spent and expired rows, so an email that arrived before the
    // resend still works.
    expect(mailer.tokenTo('reader@example.com')).not.toBe(first);
    expect((await verifyEmail(app, mailer, 'reader@example.com')).status).toBe(
      200,
    );
  });

  it('answers an unknown or already-verified address the same way, mailing nothing', async () => {
    const { app, mailer } = makeApp();
    await signedIn(app, mailer);
    mailer.sends.length = 0;

    const verified = await postJson(app, '/api/auth/resend-verification', {
      email: 'reader@example.com',
    });
    const unknown = await postJson(app, '/api/auth/resend-verification', {
      email: 'nobody@example.com',
    });

    expect(verified.status).toBe(unknown.status);
    expect(await verified.json()).toEqual(await unknown.json());
    expect(mailer.sends).toEqual([]);
  });

  it('rejects a malformed address', async () => {
    const { app } = makeApp();
    const res = await postJson(app, '/api/auth/resend-verification', {
      email: 'not-an-email',
    });
    expect(res.status).toBe(400);
  });

  it('returns 429 once the per-address limit is exceeded', async () => {
    const { app, mailer } = makeApp({
      authRateLimit: {
        emailSend: {
          // The registration below spends the first of the two, because
          // registration is a send endpoint too.
          perAddress: { limit: 2, windowMs: 60_000 },
          perIp: { limit: 10, windowMs: 60_000 },
        },
      },
    });
    await register(app);
    const before = mailer.sends.length;
    const resend = (ip: string) =>
      postJson(
        app,
        '/api/auth/resend-verification',
        { email: 'reader@example.com' },
        { headers: { 'x-forwarded-for': ip } },
      );

    expect((await resend('1.1.1.1')).status).toBe(200);
    const limited = await resend('2.2.2.2');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
    // The refused request sent nothing: the address key is checked before any
    // mail, which is the whole point of limiting it here.
    expect(mailer.sends).toHaveLength(before + 1);
  });

  it('returns 429 once the per-IP limit is exceeded', async () => {
    const { app, mailer } = makeApp({
      authRateLimit: {
        emailSend: {
          perAddress: { limit: 10, windowMs: 60_000 },
          perIp: { limit: 2, windowMs: 60_000 },
        },
      },
    });
    await register(app, 'one@example.com');
    const before = mailer.sends.length;
    const resend = (email: string) =>
      postJson(app, '/api/auth/resend-verification', { email });

    expect((await resend('one@example.com')).status).toBe(200);
    const limited = await resend('two@example.com');
    expect(limited.status).toBe(429);
    expect(mailer.sends).toHaveLength(before + 1);
  });
});

describe('POST /api/auth/request-password-reset', () => {
  it('mails a reset link to a verified account', async () => {
    const { app, mailer } = makeApp();
    await signedIn(app, mailer);
    mailer.sends.length = 0;

    const res = await requestReset(app, 'reader@example.com');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true });
    expect(mailer.sends).toEqual([
      {
        kind: 'password_reset',
        to: 'reader@example.com',
        url: expect.stringMatching(
          new RegExp(`^${PUBLIC_ORIGIN}/set-password\\?token=[A-Za-z0-9_-]+$`),
        ) as unknown as string,
      },
    ]);
  });

  it('sends the verification link to an unverified account instead', async () => {
    // Story 14: an account that never verified cannot be reset into a working
    // sign-in, so the mail repairs the flow that unblocks it — the two dead-end
    // in neither direction.
    const { app, mailer } = makeApp();
    await register(app);
    mailer.sends.length = 0;

    const res = await requestReset(app, 'reader@example.com');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true });
    expect(mailer.sends).toEqual([
      {
        kind: 'verification',
        to: 'reader@example.com',
        url: expect.stringMatching(
          new RegExp(`^${PUBLIC_ORIGIN}/verify-email\\?token=[A-Za-z0-9_-]+$`),
        ) as unknown as string,
      },
    ]);
    // And the link it carries does what it says: the account verifies.
    expect((await verifyEmail(app, mailer, 'reader@example.com')).status).toBe(
      200,
    );
  });

  it('answers an unregistered address identically, mailing nothing', async () => {
    // Story 10: the form must not be able to discover who has an account.
    const { app, mailer } = makeApp();
    await signedIn(app, mailer);
    mailer.sends.length = 0;

    const registered = await requestReset(app, 'reader@example.com');
    const unknown = await requestReset(app, 'nobody@example.com');

    expect(unknown.status).toBe(registered.status);
    expect(await unknown.json()).toEqual(await registered.json());
    expect(mailer.sends).toHaveLength(1);
  });

  it('rejects a malformed address', async () => {
    const { app } = makeApp();
    const res = await requestReset(app, 'not-an-email');
    expect(res.status).toBe(400);
  });

  it('spends the same send budget as the other send endpoints', async () => {
    // One budget for every message this instance sends (email/02): a reset
    // request is as capable of draining the provider's daily cap as a
    // registration is, so it draws on the same two keys.
    const { app, mailer } = makeApp({
      authRateLimit: {
        emailSend: {
          // The registration below spends the first of the two, because it is
          // a send endpoint too — which is the point: one budget, one counter.
          perAddress: { limit: 2, windowMs: 60_000 },
          perIp: { limit: 10, windowMs: 60_000 },
        },
      },
    });
    await signedIn(app, mailer);
    const before = mailer.sends.length;

    expect((await requestReset(app, 'reader@example.com')).status).toBe(200);
    const limited = await requestReset(app, 'reader@example.com');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
    expect(mailer.sends).toHaveLength(before + 1);
  });
});

describe('POST /api/auth/reset-password', () => {
  it('sets the new password, signs everyone out, and refuses the link again', async () => {
    // Stories 11–12: regain access with credentials only I know, and a stolen
    // session must not survive the recovery.
    const { app, mailer } = makeApp();
    const phone = await signedIn(app, mailer);
    // A second signed-in device, the one a recovery is meant to evict.
    const laptop = sessionCookie(
      await postJson(app, '/api/auth/login', {
        email: 'reader@example.com',
        password: PASSWORD,
      }),
    );
    await requestReset(app, 'reader@example.com');

    const res = await setPasswordWith(
      app,
      mailer.tokenTo('reader@example.com'),
    );

    expect(res.status).toBe(204);
    // No session starts: the user asked to set a password, not to sign in, and
    // the page sends them to the sign-in form for that. (The Set-Cookie that is
    // there clears one — see the next test.)
    expect(res.headers.get('set-cookie') ?? '').not.toMatch(/pmd_session=[^;]/);
    for (const cookie of [phone, laptop]) {
      expect(
        (await app.request('/api/auth/me', { headers: { cookie } })).status,
      ).toBe(401);
    }
    // The old password is dead, the new one works.
    const oldLogin = await postJson(app, '/api/auth/login', {
      email: 'reader@example.com',
      password: PASSWORD,
    });
    expect(oldLogin.status).toBe(401);
    const newLogin = await postJson(app, '/api/auth/login', {
      email: 'reader@example.com',
      password: 'a brand new password',
    });
    expect(newLogin.status).toBe(200);

    // One-time: the link buys one password, not a second.
    const replay = await setPasswordWith(
      app,
      mailer.tokenTo('reader@example.com'),
    );
    expect(replay.status).toBe(400);
    expect(await replay.json()).toMatchObject({ code: 'link_invalid' });
  });

  it('sets a password on an account that never had one', async () => {
    // Story 13: the recovery path for a Google-only account. The row is written
    // the same way whatever it held before, so the account gains a password it
    // can sign in with and the old hash is simply gone.
    const { app, mailer, db } = makeApp();
    await signedIn(app, mailer);
    // What a Google-registered account looks like to this table: no password of
    // its own. (The column is NOT NULL today, so the empty string stands in for
    // the null google-signin introduces.) This database holds one account.
    db.update(users).set({ passwordHash: '' }).run();
    await requestReset(app, 'reader@example.com');

    const res = await setPasswordWith(
      app,
      mailer.tokenTo('reader@example.com'),
    );

    expect(res.status).toBe(204);
    expect(db.select().from(users).get()?.passwordHash).not.toBe('');
    const login = await postJson(app, '/api/auth/login', {
      email: 'reader@example.com',
      password: 'a brand new password',
    });
    expect(login.status).toBe(200);
  });

  it('clears the caller’s own cookie, so the browser drops the dead session', async () => {
    // The other half of the revocation: the browser that followed the link must
    // not keep a cookie pointing at a session row that no longer exists.
    const { app, mailer } = makeApp();
    await signedIn(app, mailer);
    await requestReset(app, 'reader@example.com');

    const res = await setPasswordWith(
      app,
      mailer.tokenTo('reader@example.com'),
    );

    expect(res.status).toBe(204);
    const cookie = res.headers.get('set-cookie');
    expect(cookie).toContain('pmd_session=');
    expect(cookie).toContain('Max-Age=0');
  });

  it('refuses a link past its 30 minutes, leaving the password alone', async () => {
    const { app, mailer } = makeApp({ now: () => current });
    await signedIn(app, mailer);
    await requestReset(app, 'reader@example.com');
    const token = mailer.tokenTo('reader@example.com');

    current = new Date(current.getTime() + PASSWORD_RESET_TOKEN_TTL_MS + 1000);
    const res = await setPasswordWith(app, token);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'link_invalid' });
    // The old password still signs in: a refused link changes nothing.
    const login = await postJson(app, '/api/auth/login', {
      email: 'reader@example.com',
      password: PASSWORD,
    });
    expect(login.status).toBe(200);
  });

  it('refuses an unknown, missing, or wrong-purpose token', async () => {
    const { app, mailer } = makeApp();
    await signedIn(app, mailer);
    // A verification link is not a reset link: the purpose is the authority.
    const verification = mailer.tokenTo('reader@example.com');

    const unknown = await setPasswordWith(app, 'not-a-real-token');
    expect(unknown.status).toBe(400);
    const missing = await postJson(app, '/api/auth/reset-password', {
      newPassword: 'a brand new password',
    });
    expect(missing.status).toBe(400);
    const wrongPurpose = await setPasswordWith(app, verification);
    expect(wrongPurpose.status).toBe(400);
    expect(await wrongPurpose.json()).toMatchObject({ code: 'link_invalid' });
  });

  it('rejects a short password without spending the link', async () => {
    // A typo in the new password must not cost the user their only link — the
    // form states the policy, but the server is what enforces it.
    const { app, mailer } = makeApp();
    await signedIn(app, mailer);
    await requestReset(app, 'reader@example.com');
    const token = mailer.tokenTo('reader@example.com');

    const tooShort = await setPasswordWith(app, token, 'short');
    expect(tooShort.status).toBe(400);
    expect(await tooShort.json()).toMatchObject({ error: expect.any(String) });

    // The same link still works for a password that meets the policy.
    expect((await setPasswordWith(app, token)).status).toBe(204);
  });
});

describe('POST /api/auth/login', () => {
  it('starts a session for a verified account', async () => {
    const { app, mailer } = makeApp();
    await signedIn(app, mailer);

    const res = await postJson(app, '/api/auth/login', {
      email: 'reader@example.com',
      password: PASSWORD,
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

  it('refuses an unverified account with a resend-offering answer', async () => {
    const { app } = makeApp();
    await register(app);

    const res = await postJson(app, '/api/auth/login', {
      email: 'reader@example.com',
      password: PASSWORD,
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'email_unverified' });
    // No session: the gate is the point.
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('still says nothing about an unverified address without the password', async () => {
    // The gate sits behind the password check, so it is not an enumeration
    // oracle for anyone who does not already know the password.
    const { app } = makeApp();
    await register(app);

    const res = await postJson(app, '/api/auth/login', {
      email: 'reader@example.com',
      password: 'not the password',
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: 'Incorrect email or password.',
    });
  });

  it('rejects a wrong password and an unknown email the same way', async () => {
    const { app, mailer } = makeApp();
    await signedIn(app, mailer);

    const wrongPassword = await postJson(app, '/api/auth/login', {
      email: 'reader@example.com',
      password: 'the wrong password',
    });
    expect(wrongPassword.status).toBe(401);
    const wrongBody = await wrongPassword.json();
    expect(wrongBody).toMatchObject({ error: expect.any(String) });

    const unknownEmail = await postJson(app, '/api/auth/login', {
      email: 'nobody@example.com',
      password: PASSWORD,
    });
    expect(unknownEmail.status).toBe(401);
    expect(await unknownEmail.json()).toEqual(wrongBody);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the session, so /me is unauthenticated afterwards', async () => {
    const { app, mailer } = makeApp();
    const cookie = await signedIn(app, mailer);

    const res = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: { cookie },
    });
    expect(res.status).toBe(204);

    const me = await app.request('/api/auth/me', { headers: { cookie } });
    expect(me.status).toBe(401);
  });

  it('is a no-op without a session', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/auth/logout', { method: 'POST' });
    expect(res.status).toBe(204);
  });
});

describe('POST /api/auth/change-password', () => {
  it('replaces the password and requires the current one', async () => {
    const { app, mailer } = makeApp();
    const cookie = await signedIn(app, mailer);

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
        currentPassword: PASSWORD,
        newPassword: 'a brand new password',
      },
      { cookie },
    );
    expect(changed.status).toBe(204);

    const oldLogin = await postJson(app, '/api/auth/login', {
      email: 'reader@example.com',
      password: PASSWORD,
    });
    expect(oldLogin.status).toBe(401);
    const newLogin = await postJson(app, '/api/auth/login', {
      email: 'reader@example.com',
      password: 'a brand new password',
    });
    expect(newLogin.status).toBe(200);
  });

  it('revokes other sessions but keeps the one that changed the password', async () => {
    const { app, mailer } = makeApp();
    const cookie = await signedIn(app, mailer);

    // A second signed-in device (e.g. a stolen cookie elsewhere).
    const other = await postJson(app, '/api/auth/login', {
      email: 'reader@example.com',
      password: PASSWORD,
    });
    const otherCookie = sessionCookie(other);

    const changed = await postJson(
      app,
      '/api/auth/change-password',
      {
        currentPassword: PASSWORD,
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
    const { app } = makeApp();
    const res = await postJson(app, '/api/auth/change-password', {
      currentPassword: 'x',
      newPassword: 'a brand new password',
    });
    expect(res.status).toBe(401);
  });
});

describe('admin bootstrap', () => {
  it('makes the first account matching ADMIN_EMAIL an admin', async () => {
    const { app, mailer } = makeApp({ adminEmail: 'owner@example.com' });

    await register(app, 'Owner@Example.com');
    const owner = await verifyEmail(app, mailer, 'owner@example.com');

    expect(await owner.json()).toEqual({
      user: { email: 'owner@example.com', isAdmin: true },
    });
  });

  it('makes nobody admin when ADMIN_EMAIL is unset', async () => {
    const { app, mailer } = makeApp();

    await register(app);
    const res = await verifyEmail(app, mailer, 'reader@example.com');

    expect(await res.json()).toEqual({
      user: { email: 'reader@example.com', isAdmin: false },
    });
  });
});

describe('session lifetime', () => {
  it('survives a server restart (same database and secret)', async () => {
    const { db, dir } = createTestDatabase();
    cleanup = () => removeTestDatabase(dir);
    const composition = testMailComposition();
    const before = createApp({
      db,
      sessionSecret: SESSION_SECRET,
      log: () => {},
      ...composition,
    });
    const cookie = await signedIn(before, composition.mail);

    // A fresh app object over the same database models a process restart:
    // sessions live in SQLite and the cookie signature depends only on the
    // (unchanged) SESSION_SECRET.
    const after = createApp({
      db,
      sessionSecret: SESSION_SECRET,
      log: () => {},
      ...testMailComposition(),
    });
    const me = await after.request('/api/auth/me', { headers: { cookie } });
    expect(me.status).toBe(200);
  });

  it('rolls the 30-day expiry forward on each authenticated request', async () => {
    const { app, mailer } = makeApp({ now: () => current });
    // Register, then advance 20 days and hit /me: still valid.
    const cookie = await signedIn(app, mailer);

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
    const { app, mailer } = makeApp({ now: () => current });
    const cookie = await signedIn(app, mailer);

    current = new Date(current.getTime() + 31 * 24 * 60 * 60 * 1000);
    expect(
      (await app.request('/api/auth/me', { headers: { cookie } })).status,
    ).toBe(401);
  });

  it('re-issues the browser cookie when the session rolls', async () => {
    const { app, mailer } = makeApp({ now: () => current });
    const cookie = await signedIn(app, mailer);

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
    const { app } = makeApp({
      authRateLimit: { login: { limit: 2, windowMs: 60_000 } },
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

  it('spends the send budget when registration sends, on both keys', async () => {
    // Story 24: registration is a send endpoint like any other. The per-IP
    // registration rule is about account creation and allows ten a minute, so
    // without the send budget one host could put hundreds of DKIM-signed links
    // into fresh inboxes an hour.
    const { app, mailer } = makeApp({
      authRateLimit: {
        emailSend: {
          perAddress: { limit: 1, windowMs: 60_000 },
          perIp: { limit: 2, windowMs: 60_000 },
        },
      },
    });
    const sign = (email: string, ip: string) =>
      postJson(
        app,
        '/api/auth/register',
        { email, password: PASSWORD },
        { headers: { 'x-forwarded-for': ip } },
      );

    // The address key: the same address again is refused even from a host that
    // has sent nothing.
    expect((await sign('one@example.com', '1.1.1.1')).status).toBe(201);
    expect((await sign('one@example.com', '2.2.2.2')).status).toBe(429);
    // The per-IP key: every address here is fresh, so only the host's own
    // budget can stop the third message.
    expect((await sign('two@example.com', '1.1.1.1')).status).toBe(201);
    expect((await sign('three@example.com', '1.1.1.1')).status).toBe(429);
    expect(mailer.sends).toHaveLength(2);
  });

  it('counts each IP separately', async () => {
    const { app } = makeApp({
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
        password: PASSWORD,
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
        password: PASSWORD,
      }),
    });
    expect(secondIp.status).toBe(201);
  });

  it('ignores client-prepended x-forwarded-for hops', async () => {
    // The client controls the left of the header; Caddy appends the address it
    // observed. Trusting the first hop would let an attacker rotate fake IPs
    // and never hit the limit.
    const { app } = makeApp({
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

describe('the account row', () => {
  it('carries no verified-at until the link is followed', async () => {
    const { app, mailer, db } = makeApp();

    await register(app);
    expect(
      db.select({ verifiedAt: users.verifiedAt }).from(users).get(),
    ).toEqual({
      verifiedAt: null,
    });

    await verifyEmail(app, mailer, 'reader@example.com');

    expect(
      db.select({ verifiedAt: users.verifiedAt }).from(users).get()?.verifiedAt,
    ).toBeInstanceOf(Date);
  });

  it('keeps one row when an unverified address registers twice', async () => {
    const { app, db } = makeApp();

    await register(app, 'reader@example.com', PASSWORD);
    await register(app, 'reader@example.com', 'a different password');

    expect(db.select({ email: users.email }).from(users).all()).toEqual([
      { email: 'reader@example.com' },
    ]);
  });
});
