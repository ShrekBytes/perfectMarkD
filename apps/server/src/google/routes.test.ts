import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp, type AppType } from '../index.js';
import { createTestDatabase, removeTestDatabase } from '../db/testing.js';
import type { AppDatabase } from '../db/database.js';
import { identities, sessions, users } from '../db/schema.js';
import { TEST_PUBLIC_ORIGIN, testMailComposition } from '../auth/testing.js';
import { SESSION_TTL_MS } from '../auth/sessions.js';
import type { RecordingMailer } from '../mail/testing.js';
import { resolveGoogleSignIn, type GoogleIdentity } from './exchange.js';

const SESSION_SECRET = 'test-session-secret';
const PASSWORD = 'correct horse battery';
const REDIRECT_URI = 'https://app.test/auth/google/callback';
const GOOGLE = { subject: '107346332299', email: 'ada@example.com' };
/** The clock every composition in this file runs on. */
const CURRENT = new Date('2026-09-27T12:00:00Z');

let cleanup: (() => void) | undefined;
let logs: string[] = [];

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  logs = [];
});

/** The fake exchange tests inject: one canned identity per code, or a throw. */
interface FakeExchange {
  exchange: (code: string) => Promise<GoogleIdentity>;
  /** The codes it was asked for, in order. */
  codes: string[];
}

function fakeExchange(
  identities: Record<string, GoogleIdentity>,
): FakeExchange {
  const codes: string[] = [];
  return {
    codes,
    exchange: async (code) => {
      codes.push(code);
      const identity = identities[code];
      if (!identity) throw new Error(`no identity for ${code}`);
      return identity;
    },
  };
}

function makeApp(
  options: {
    exchange?: FakeExchange;
    adminEmail?: string;
    rateLimit?: { limit: number; windowMs: number };
    /** Omit the Google half entirely: an unconfigured deployment. */
    unconfigured?: boolean;
  } = {},
): {
  app: AppType;
  db: AppDatabase;
  mailer: RecordingMailer;
  exchange: FakeExchange | null;
} {
  const { db, dir } = createTestDatabase();
  cleanup = () => removeTestDatabase(dir);
  const composition = testMailComposition();
  const fake = options.exchange ?? fakeExchange({ 'auth-code': GOOGLE });
  const app = createApp({
    db,
    log: (line) => logs.push(line),
    sessionSecret: SESSION_SECRET,
    now: () => CURRENT,
    adminEmail: options.adminEmail ?? null,
    authRateLimit: options.rateLimit
      ? { googleSignIn: options.rateLimit }
      : undefined,
    ...composition,
    google: options.unconfigured
      ? null
      : (resolveGoogleSignIn({
          clientId: 'client-id.apps.googleusercontent.com',
          clientSecret: 'GOCSPX-secret',
          redirectUri: REDIRECT_URI,
          exchange: fake.exchange,
        }) ?? null),
  });
  return {
    app,
    db,
    mailer: composition.mail,
    exchange: options.unconfigured ? null : fake,
  };
}
/** One `Set-Cookie` entry, attributes and all, by cookie name. */
function cookieEntry(res: Response, name: string): string {
  const entry = res.headers
    .get('set-cookie')
    ?.split(/, (?=[^;]+?=)/)
    .find((one) => one.startsWith(`${name}=`));
  if (!entry) {
    throw new Error(
      `no ${name} cookie in: ${res.headers.get('set-cookie') ?? '(none)'}`,
    );
  }
  return entry;
}

/** The `name=value` pair from a Set-Cookie entry, for replaying requests. */
function cookiePair(res: Response, name: string): string {
  return cookieEntry(res, name).split(';')[0] as string;
}

/** The `pmd_session=…` pair, as the browser would send it back. */
function sessionCookie(res: Response): string {
  return cookiePair(res, 'pmd_session');
}

/** The flow's first leg: the redirect to Google's consent screen. */
async function start(app: AppType) {
  const res = await app.request('/auth/google/start');
  const location = new URL(res.headers.get('location') ?? '');
  return {
    res,
    location,
    state: location.searchParams.get('state') ?? '',
    cookie: cookiePair(res, 'pmd_google_state'),
  };
}

/** The flow's second leg, as Google redirects the browser back. */
function callback(
  app: AppType,
  {
    state,
    cookie,
    code = 'auth-code',
    googleError,
  }: {
    state?: string | null;
    cookie?: string | null;
    code?: string;
    googleError?: string;
  },
) {
  const query = new URLSearchParams();
  if (googleError) query.set('error', googleError);
  if (state) query.set('state', state);
  if (code) query.set('code', code);
  return app.request(`/auth/google/callback?${query}`, {
    headers: cookie ? { cookie } : {},
  });
}

/** The whole flow in two legs; `res` is the callback's response. */
async function signInWithGoogle(
  app: AppType,
  code = 'auth-code',
): Promise<Response> {
  const { state, cookie } = await start(app);
  return callback(app, { state, cookie, code });
}

/** Who the given session says it is, read back the way any page would. */
async function whoAmI(app: AppType, cookie: string) {
  const res = await app.request('/api/auth/me', { headers: { cookie } });
  return { status: res.status, body: await res.json() };
}

/** Registers an account and follows the verification link, as a user would. */
async function passwordAccount(
  app: AppType,
  mailer: RecordingMailer,
  email: string,
): Promise<string> {
  await app.request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const verified = await app.request('/api/auth/verify-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: mailer.tokenTo(email) }),
  });
  return sessionCookie(verified);
}

describe('GET /auth/google/start', () => {
  it('redirects to the consent screen with the three non-sensitive scopes', async () => {
    const { app } = makeApp();

    const { res, location } = await start(app);

    expect(res.status).toBe(302);
    expect(location.origin + location.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    const params = location.searchParams;
    expect(params.get('client_id')).toBe(
      'client-id.apps.googleusercontent.com',
    );
    expect(params.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(params.get('response_type')).toBe('code');
    expect(params.get('scope')?.split(' ').sort()).toEqual([
      'email',
      'openid',
      'profile',
    ]);
    // Nothing asks for a consent screen to be shown again, and nothing asks
    // for a refresh token: the flow is a sign-in, not a lasting grant.
    expect(params.has('prompt')).toBe(false);
    expect(params.get('access_type')).toBeNull();
  });

  it('binds the state to an httpOnly cookie the callback has to present', async () => {
    const { app } = makeApp();

    const { state, cookie, res } = await start(app);

    expect(state).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(cookie).toBe(`pmd_google_state=${state}`);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/HttpOnly/i);
    // Lax, not Strict: the callback is a top-level navigation back from
    // Google, and a Strict cookie would not ride along with it.
    expect(setCookie).toMatch(/SameSite=Lax/i);
  });
});

describe('GET /auth/google/callback', () => {
  it('registers a passwordless verified account and signs it in', async () => {
    const { app, db, mailer, exchange } = makeApp();

    const res = await signInWithGoogle(app);

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${TEST_PUBLIC_ORIGIN}/`);
    const cookie = sessionCookie(res);
    expect(await whoAmI(app, cookie)).toEqual({
      status: 200,
      body: { user: { email: 'ada@example.com', isAdmin: false } },
    });
    expect(exchange?.codes).toEqual(['auth-code']);

    // The account is verified by construction (Google proved the address) and
    // the flow sends no email at all.
    const account = db.select().from(users).get();
    expect(account?.verifiedAt).toBeInstanceOf(Date);
    expect(mailer.sends).toEqual([]);
    // One identity, one account: the subject is the link.
    expect(db.select().from(identities).all()).toHaveLength(1);
  });

  it('issues the same session a password sign-in issues', async () => {
    const { app, db } = makeApp();

    const res = await signInWithGoogle(app);

    // The same signed, httpOnly cookie — nothing about an unlinked Google
    // callback is visible to the session machinery.
    const setCookie = cookieEntry(res, 'pmd_session');
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toContain(`Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`);
    // ...and the same rolling lifetime, measured off the injected clock.
    const stored = db.select().from(sessions).get();
    expect(stored?.expiresAt.getTime()).toBe(
      CURRENT.getTime() + SESSION_TTL_MS,
    );
  });

  it('signs a returning user back into the same account', async () => {
    const { app, db } = makeApp();

    const first = await signInWithGoogle(app);
    const second = await signInWithGoogle(app);

    const user = (await whoAmI(app, sessionCookie(second))).body.user;
    expect(user).toEqual((await whoAmI(app, sessionCookie(first))).body.user);
    expect(db.select().from(users).all()).toHaveLength(1);
    expect(db.select().from(identities).all()).toHaveLength(1);
  });

  it('matches on the Google account id, not the address it answers with', async () => {
    // A Google account whose address has since changed: the subject is what
    // identifies the user, and their account keeps its own address.
    const { app, exchange } = makeApp({
      exchange: fakeExchange({
        'auth-code': { subject: GOOGLE.subject, email: 'ada@example.com' },
        'moved-code': { subject: GOOGLE.subject, email: 'ada@new.example.com' },
      }),
    });

    const first = sessionCookie(await signInWithGoogle(app));
    const second = sessionCookie(await signInWithGoogle(app, 'moved-code'));

    expect((await whoAmI(app, second)).body.user).toEqual(
      (await whoAmI(app, first)).body.user,
    );
    expect(exchange?.codes).toEqual(['auth-code', 'moved-code']);
  });

  it('links to a password account with the same address, sending no email', async () => {
    const { app, db, mailer } = makeApp();

    await passwordAccount(app, mailer, GOOGLE.email);
    const before = db.select().from(users).get();
    const sendsBefore = mailer.sends.length;
    const res = await signInWithGoogle(app);

    expect((await whoAmI(app, sessionCookie(res))).body.user).toEqual({
      email: GOOGLE.email,
      isAdmin: false,
    });
    // The same account — no second one for one inbox — and nothing was mailed.
    expect(db.select().from(users).all()).toHaveLength(1);
    expect(db.select().from(identities).get()?.userId).toBe(before?.id);
    expect(mailer.sends).toHaveLength(sendsBefore);
  });

  it('verifies an unverified account as a side effect of signing in', async () => {
    const { app, db } = makeApp();

    // Registered but never verified: sign-in by password stays locked.
    await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: GOOGLE.email, password: PASSWORD }),
    });
    const res = await signInWithGoogle(app);

    expect((await whoAmI(app, sessionCookie(res))).body.user).toEqual({
      email: GOOGLE.email,
      isAdmin: false,
    });
    expect(db.select().from(users).get()?.verifiedAt).toBeInstanceOf(Date);
    // The password it registered with is untouched, so both paths now work.
    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: GOOGLE.email, password: PASSWORD }),
    });
    expect(login.status).toBe(200);
  });

  it('makes the first account registered with the admin email the Admin', async () => {
    const { app } = makeApp({
      adminEmail: 'Owner@Example.com',
      exchange: fakeExchange({
        'auth-code': { subject: GOOGLE.subject, email: 'owner@example.com' },
      }),
    });

    const res = await signInWithGoogle(app);

    expect((await whoAmI(app, sessionCookie(res))).body.user).toEqual({
      email: 'owner@example.com',
      isAdmin: true,
    });
  });

  it('refuses a callback whose state is not the one it bound', async () => {
    const { app, db } = makeApp();
    const { state, cookie } = await start(app);

    const forged = await callback(app, { state: `${state}x`, cookie });
    const missing = await callback(app, { state, cookie: null });

    for (const res of [forged, missing]) {
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(
        `${TEST_PUBLIC_ORIGIN}/login?google=error`,
      );
      expect(res.headers.get('set-cookie')?.match(/pmd_session/)).toBeFalsy();
    }
    expect(db.select().from(users).all()).toEqual([]);
  });

  it('reports a cancelled consent screen as a decline', async () => {
    const { app, db } = makeApp();
    const { state, cookie } = await start(app);

    const res = await callback(app, {
      state,
      cookie,
      googleError: 'access_denied',
    });

    expect(res.headers.get('location')).toBe(
      `${TEST_PUBLIC_ORIGIN}/login?google=declined`,
    );
    expect(db.select().from(users).all()).toEqual([]);
  });

  it('sends the user back to the sign-in form when Google fails us', async () => {
    const { app, db } = makeApp({
      exchange: fakeExchange({ 'auth-code': GOOGLE }),
    });

    const { state, cookie } = await start(app);
    const res = await callback(app, { state, cookie, code: 'stale-code' });

    expect(res.headers.get('location')).toBe(
      `${TEST_PUBLIC_ORIGIN}/login?google=error`,
    );
    expect(res.headers.get('set-cookie')?.match(/pmd_session/)).toBeFalsy();
    expect(db.select().from(users).all()).toEqual([]);
    // The failure is logged for the operator, and logs no code from the
    // provider's side.
    expect(logs.join('\n')).toMatch(/google/i);
    expect(logs.join('\n')).not.toMatch(/stale-code/);
  });

  it('limits the start leg per IP and hands out no state once over', async () => {
    const { app } = makeApp({ rateLimit: { limit: 2, windowMs: 60_000 } });

    const first = await start(app);
    const second = await start(app);
    expect(first.res.status).toBe(302);
    expect(second.res.status).toBe(302);
    // A refused start has no state to hand out, so it is read raw.
    const limited = await app.request('/auth/google/start');
    expect(limited.status).toBe(302);
    expect(limited.headers.get('location')).toBe(
      `${TEST_PUBLIC_ORIGIN}/login?google=rate_limited`,
    );
    expect(limited.headers.get('set-cookie')).toBeNull();
  });

  it('limits the callback leg on its own budget, and leaves no account', async () => {
    // Two slots a minute, and only the callback leg spends one — the start
    // that fetched the state is not charged for it, because behind one address
    // (a Cloudflare Tunnel, an office) everybody is the same key.
    const { app, db } = makeApp({ rateLimit: { limit: 2, windowMs: 60_000 } });
    const { state, cookie } = await start(app);
    // A callback that cannot be vouched for spends one all the same.
    await callback(app, { state: 'forged', cookie });
    await callback(app, { state: 'forged-again', cookie });

    const refused = await callback(app, { state, cookie });

    expect(refused.status).toBe(302);
    expect(refused.headers.get('location')).toBe(
      `${TEST_PUBLIC_ORIGIN}/login?google=rate_limited`,
    );
    expect(refused.headers.get('set-cookie')?.match(/pmd_session/)).toBeFalsy();
    expect(db.select().from(users).all()).toEqual([]);
  });
});

describe('a deployment with no Google client', () => {
  it('does not have the routes at all, and says so', async () => {
    const { app } = makeApp({ unconfigured: true });

    expect((await app.request('/auth/google/start')).status).toBe(404);
    expect((await app.request('/auth/google/callback?code=x')).status).toBe(
      404,
    );
    const providers = await app.request('/api/auth/providers');
    expect(await providers.json()).toEqual({ google: false });
  });

  it('advertises the feature when it is configured', async () => {
    const { app } = makeApp();

    const providers = await app.request('/api/auth/providers');

    expect(await providers.json()).toEqual({ google: true });
  });
});

describe('the identity link', () => {
  it('follows the account when it is deleted, and forgets the identity', async () => {
    const { app, db } = makeApp();
    await signInWithGoogle(app);

    const account = db.select().from(users).get();
    db.delete(users).where(eq(users.id, account!.id)).run();

    expect(db.select().from(identities).all()).toEqual([]);
  });
});
