// ─────────────────────────────────────────────────────────────────────────────
// Google Sign-In, server side (google-signin/01): the two legs of the OAuth 2.0
// Authorization Code flow, the identity link, and the auto-link rule.
//
// The API starts the flow (a redirect to Google with a cookie-bound `state`)
// and receives the callback (code exchange, identity fetch, session). Nothing
// about a session here is special: the callback calls the same createSession
// and sets the same signed cookie as a password sign-in, so the session
// machinery cannot tell an unlinked Google callback from a password.
//
// Every response here is a browser navigation — the user is coming back from
// Google's page, not calling an API — so every answer is a redirect to the
// SPA, with a code the sign-in page turns into a sentence. A JSON body in that
// window is a wall of text where the user expected to be signed in.
//
// The auto-link rule, in one place (`claimAccount`): match the Google account
// id, else the address; a password account signs in, an unverified one signs
// in and becomes verified, no match registers a passwordless verified account.
// Google has proven the address, so no email goes out — not here, not through
// the Mailer (ADR-0013 is untouched by this feature).
// ─────────────────────────────────────────────────────────────────────────────

import { Hono, type Context } from 'hono';
import { and, eq } from 'drizzle-orm';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv } from '../index.js';
import type { AppDatabase } from '../db/database.js';
import { identities, users, GOOGLE_PROVIDER, type User } from '../db/schema.js';
import { newOpaqueToken } from '../auth/opaque-token.js';
import { normalizeEmail } from '../auth/routes.js';
import { clientIp, isHttps, setSessionCookie } from '../auth/http.js';
import { createSession, type Clock } from '../auth/sessions.js';
import {
  DEFAULT_AUTH_RATE_LIMITS,
  FixedWindowRateLimiter,
  type AuthRateLimitConfig,
} from '../auth/rate-limit.js';
import type { LogSink } from '../request-logger.js';
import {
  authorizationUrl,
  type GoogleIdentity,
  type GoogleSignIn,
} from './exchange.js';
import { UpstreamError } from '../fetch-with-timeout.js';

/** The one-time value that binds a callback to the browser that started it. */
const STATE_COOKIE = 'pmd_google_state';
/** Long enough to walk a consent screen, short enough that a state captured
 *  from someone's own browser is worthless a moment later. */
const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * What the sign-in page is told about a callback it could not complete. The
 * codes are stable and the sentences are not: the SPA owns the wording, and
 * the only question the server answers is "how did that go?".
 *
 * - `declined` — the user closed Google's consent screen. Not our failure.
 * - `error` — anything else: a callback we cannot vouch for, or a provider
 *   that would not answer. One answer, because the recovery is the same.
 * - `rate_limited` — too many attempts; `retry-after` says when.
 */
type GoogleErrorCode = 'declined' | 'error' | 'rate_limited';

interface GoogleRoutesOptions {
  /** The deployment's OAuth client and the identity-exchange seam. */
  google: GoogleSignIn;
  /**
   * PUBLIC_ORIGIN: where the browser is sent once the flow is done. The
   * success target is the editor; every failure goes back to the sign-in form
   * with its code, so a user whose Google leg failed keeps their place and can
   * type a password instead (spec §SPA surface).
   */
  publicOrigin: string;
  /** Signs session cookies; the same secret as every other sign-in. */
  sessionSecret: string;
  /** First registered account with this email becomes the Admin, either way. */
  adminEmail: string | null;
  /** Per-route override for the flow's rate limit (tests tighten it). */
  authRateLimit?: AuthRateLimitConfig;
  now?: Clock;
  log?: LogSink;
}

export function googleRoutes(options: GoogleRoutesOptions) {
  const app = new Hono<AppEnv>();
  const { google } = options;
  const now = options.now ?? (() => new Date());
  // One rule, two budgets: the start and the callback are limited separately,
  // so a sign-in costs a slot on each rather than two on one. Sharing would
  // halve the limit for everyone behind one address — and behind a Cloudflare
  // Tunnel (ADR-0010) that is every visitor — and would let one address's junk
  // callbacks spend a stranger's sign-in.
  const rule = {
    ...DEFAULT_AUTH_RATE_LIMITS,
    ...options.authRateLimit,
  }.googleSignIn;
  const limiters = {
    start: new FixedWindowRateLimiter(rule),
    callback: new FixedWindowRateLimiter(rule),
  };

  /** Every failure the user can meet, as the sign-in page's code. */
  const fail = (c: Context<AppEnv>, code: GoogleErrorCode) =>
    c.redirect(`${options.publicOrigin}/login?google=${code}`);

  const rejectOverBudget = (c: Context<AppEnv>, leg: keyof typeof limiters) => {
    const decision = limiters[leg].check(clientIp(c));
    if (decision.allowed) return null;
    c.header('retry-after', String(decision.retryAfterSeconds));
    return fail(c, 'rate_limited');
  };

  app.get('/start', (c) => {
    const limited = rejectOverBudget(c, 'start');
    if (limited) return limited;

    // The state lives in an httpOnly cookie and goes out in the redirect. The
    // callback compares the two, so a callback injected into someone's browser
    // (their own code, someone else's account) cannot complete.
    const state = newOpaqueToken();
    setCookie(c, STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: Math.floor(STATE_TTL_MS / 1000),
      secure: isHttps(c),
    });
    return c.redirect(
      authorizationUrl({
        clientId: google.clientId,
        redirectUri: google.redirectUri,
        state,
      }),
    );
  });

  app.get('/callback', async (c) => {
    const limited = rejectOverBudget(c, 'callback');
    if (limited) return limited;

    // Spent either way: a state cookie that survives a callback is a second
    // chance nobody should have.
    const expected = getCookie(c, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: '/' });

    // The binding is checked before anything Google said is acted on, and
    // before the code is spent.
    const state = c.req.query('state');
    if (!expected || !state || state !== expected) return fail(c, 'error');

    // A cancelled consent screen comes back with Google's own error and no
    // code. It is the one failure that is not ours, and the user is told so.
    const denied = c.req.query('error');
    if (denied)
      return fail(c, denied === 'access_denied' ? 'declined' : 'error');

    let identity: GoogleIdentity;
    try {
      identity = await google.exchange(c.req.query('code') ?? '');
    } catch (cause) {
      options.log?.(
        `google sign-in exchange failed: ${
          cause instanceof UpstreamError ? cause.code : 'unknown'
        }`,
      );
      return fail(c, 'error');
    }

    // Google has proven the address (the seam refuses an identity it has not),
    // so an address that is not one cannot become a verified account.
    const email = normalizeEmail(identity.email);
    if (!identity.subject || email === null) return fail(c, 'error');

    const at = now();
    const user = claimAccount(c.var.db, {
      subject: identity.subject,
      email,
      at,
      isAdmin:
        options.adminEmail !== null &&
        email === options.adminEmail.trim().toLowerCase(),
    });
    await setSessionCookie(
      c,
      options.sessionSecret,
      createSession(c.var.db, user.id, at),
    );
    return c.redirect(`${options.publicOrigin}/`);
  });

  return app;
}

/**
 * The auto-link rule, in one function. Returns the account the identity belongs
 * to, registering one if the address is new.
 *
 * Match the Google account id first: it is the only thing that cannot be
 * reassigned, so an address that has since changed at Google still finds the
 * right account. Only then is the email used, and only as a bridge to an account
 * that already exists — which is the whole point of the feature, since a user
 * who registered here before signing in there should end up with one account
 * and one inbox.
 *
 * An account found by email is signed into, never claimed: an unverified one
 * becomes verified (Google proved that address) and a password account is
 * left exactly as it was, password included.
 *
 * Deliberately synchronous, all of it: nothing awaits between the uniqueness
 * check and the insert, so two callbacks racing on one fresh address cannot
 * both pass the check and reach the UNIQUE index. That is why this needs no
 * `isUniqueViolation` catch (the way password registration does, where an
 * argon2 hash awaits between its check and its insert). Anything that puts an
 * await in that window has to bring the catch with it.
 */
function claimAccount(
  db: AppDatabase,
  {
    subject,
    email,
    at,
    isAdmin,
  }: { subject: string; email: string; at: Date; isAdmin: boolean },
): User {
  const linked = db
    .select({ user: users })
    .from(identities)
    .innerJoin(users, eq(users.id, identities.userId))
    .where(
      and(
        eq(identities.provider, GOOGLE_PROVIDER),
        eq(identities.subject, subject),
      ),
    )
    .get();
  if (linked) return linked.user;

  const account = verifiedAccount(db, email, at, isAdmin);
  db.insert(identities)
    .values({ provider: GOOGLE_PROVIDER, subject, userId: account.id, email })
    .run();
  return account;
}

/** The account for a proven address: the one that has it, or a new one. */
function verifiedAccount(
  db: AppDatabase,
  email: string,
  at: Date,
  isAdmin: boolean,
): User {
  const existing = db.select().from(users).where(eq(users.email, email)).get();
  if (!existing) {
    return db
      .insert(users)
      .values({
        email,
        // A Google account has no password and the column is not nullable, so
        // it starts empty — which is both a value no login can match
        // (`verifyPassword` treats a malformed hash as a failed match) and the
        // answer to "does this account have a password of its own?", which the
        // Account page asks. Password Reset and set-password overwrite it.
        passwordHash: '',
        isAdmin,
        verifiedAt: at,
      })
      .returning()
      .get();
  }
  if (existing.verifiedAt) return existing;
  return db
    .update(users)
    .set({ verifiedAt: at })
    .where(eq(users.id, existing.id))
    .returning()
    .get();
}
