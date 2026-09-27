import { Hono, type Context } from 'hono';
import { eq } from 'drizzle-orm';
import type { AppEnv } from '../index.js';
import { isUniqueViolation } from '../db/sqlite-errors.js';
import { asRecord, parseJson } from '../request-body.js';
import { users } from '../db/schema.js';
import {
  hashPassword,
  verifyPassword,
  DUMMY_PASSWORD_HASH,
} from './passwords.js';
import {
  createSession,
  deleteOtherSessions,
  deleteSession,
} from './sessions.js';
import type { Clock } from './sessions.js';
import { clearSessionCookie, clientIp, setSessionCookie } from './http.js';
import {
  DEFAULT_AUTH_RATE_LIMITS,
  FixedWindowRateLimiter,
  type AuthRateLimitConfig,
} from './rate-limit.js';
import { issueToken, oneTimeLink, redeemToken } from './tokens.js';

export interface AuthOptions {
  /** Signs session cookies; resolved from env by createApp. */
  sessionSecret: string;
  /** First registered account with this email becomes the Admin. */
  adminEmail: string | null;
  /**
   * PUBLIC_ORIGIN: the address users reach this instance on. The one-time
   * links in transactional email are built from it and from nothing else — a
   * request's Host header is attacker-supplied.
   */
  publicOrigin: string;
  /** Per-route overrides for the auth rate limits (tests tighten these). */
  authRateLimit?: AuthRateLimitConfig;
  /** Injectable clock (tests control session expiry). */
  now?: Clock;
}

const MIN_PASSWORD_LENGTH = 8;
// Deliberately permissive: an address with a local part, an @, and a domain
// with a dot. Anything stricter rejects valid addresses; verification is a
// link the owner follows, which is what proves the address.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The SPA page a verification link resolves to; it spends the token over the
 *  API, so a link scanner that follows the URL in an inbox cannot spend it. */
const VERIFY_PATH = '/verify-email';

/**
 * Codes the client branches on, never the message beside them: the sign-in gate
 * offers a resend, and a spent link offers a fresh one.
 */
export const EMAIL_UNVERIFIED_CODE = 'email_unverified';
export const LINK_INVALID_CODE = 'link_invalid';

/**
 * One answer for every way a link fails to redeem — unknown, expired, already
 * spent, or issued for another flow. Distinguishing them would tell a stranger
 * holding a dead link something about the account behind it, and the recovery is
 * the same either way: ask for a fresh link.
 */
function invalidLink(c: Context<AppEnv>) {
  return c.json(
    {
      error:
        'That verification link is no longer valid — it may have expired or already been used.',
      code: LINK_INVALID_CODE,
    },
    400,
  );
}

interface Credentials {
  email: string;
  password: string;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string' || !EMAIL_PATTERN.test(value.trim())) {
    return null;
  }
  return value.trim().toLowerCase();
}

/** Registration validates the password policy; login accepts any non-empty one. */
function parseRegistration(body: unknown): Credentials | { error: string } {
  const record = asRecord(body);
  if (!record) {
    return { error: 'Expected a JSON object.' };
  }
  const normalized = normalizeEmail(record.email);
  if (normalized === null) {
    return { error: 'Enter a valid email address.' };
  }
  if (
    typeof record.password !== 'string' ||
    record.password.length < MIN_PASSWORD_LENGTH
  ) {
    return {
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  return { email: normalized, password: record.password };
}

function parseLogin(body: unknown): Credentials | { error: string } {
  const record = asRecord(body);
  if (!record) {
    return { error: 'Expected a JSON object.' };
  }
  const normalized = normalizeEmail(record.email);
  // Login uses the same shape errors as registration, but the only password
  // rule is "non-empty" — verification itself decides.
  if (
    normalized === null ||
    typeof record.password !== 'string' ||
    record.password === ''
  ) {
    return { error: 'Enter your email and password.' };
  }
  return { email: normalized, password: record.password };
}

function publicUser(user: { email: string; isAdmin: boolean }) {
  return { email: user.email, isAdmin: user.isAdmin };
}

/**
 * Email + password accounts (server/02), with Email Verification in front of
 * sign-in (email/02). A registration creates an unverified account and mails a
 * one-time link; sign-in is refused until that link is followed, so every paying
 * user is reachable at a proven address (ADR-0005's Manual Payment flow).
 * Routes are mounted under /api/auth.
 */
export function authRoutes(options: AuthOptions) {
  const app = new Hono<AppEnv>();
  const now = options.now ?? (() => new Date());
  const limits = { ...DEFAULT_AUTH_RATE_LIMITS, ...options.authRateLimit };
  const limiters = {
    login: new FixedWindowRateLimiter(limits.login),
    register: new FixedWindowRateLimiter(limits.register),
    changePassword: new FixedWindowRateLimiter(limits.changePassword),
    // Registration and the resend send the same kind of message, so they share
    // one send budget on both keys: the per-IP rule above bounds account
    // creation at ten a minute and says nothing about mail, and a per-IP rule
    // alone cannot see a flood aimed at one inbox from many hosts.
    sendAddress: new FixedWindowRateLimiter(limits.emailSend.perAddress),
    sendIp: new FixedWindowRateLimiter(limits.emailSend.perIp),
  };

  /** Returns a 429 response when the key is over budget, else null. */
  const rejectRateLimited = (
    c: Context<AppEnv>,
    limiter: FixedWindowRateLimiter,
    key: string = clientIp(c),
  ) => {
    const decision = limiter.check(key);
    if (decision.allowed) return null;
    c.header('retry-after', String(decision.retryAfterSeconds));
    return c.json({ error: 'Too many attempts. Try again shortly.' }, 429);
  };

  /** Issues a fresh verification link and mails it. */
  const sendVerification = async (
    c: Context<AppEnv>,
    userId: number,
    email: string,
  ) => {
    const token = issueToken(
      c.var.db,
      { purpose: 'verification', userId },
      now(),
    );
    await c.var.mailer.sendVerification({
      to: email,
      url: oneTimeLink(options.publicOrigin, VERIFY_PATH, token),
    });
  };

  /**
   * The account id a registration should use, or null when the address already
   * belongs to a verified account (the one rejection registration keeps).
   *
   * An unverified address re-uses its row and re-sends, behind a response
   * identical to a fresh registration — so the form cannot be used to learn
   * whether an address is registered (story 7), and a user who mistyped one can
   * still register the address they meant (story 6). The password hash is left
   * untouched on that path: overwriting it would let anyone who knows an
   * unverified address set the password and sign in the moment its owner
   * verifies.
   */
  const unverifiedAccountId = async (
    c: Context<AppEnv>,
    email: string,
    password: string,
  ): Promise<number | null> => {
    const existing = c.var.db
      .select({ id: users.id, verifiedAt: users.verifiedAt })
      .from(users)
      .where(eq(users.email, email))
      .get();
    if (existing) return existing.verifiedAt ? null : existing.id;

    const isAdmin =
      options.adminEmail !== null &&
      email === options.adminEmail.trim().toLowerCase();
    try {
      const inserted = c.var.db
        .insert(users)
        .values({ email, passwordHash: await hashPassword(password), isAdmin })
        .returning({ id: users.id })
        .get();
      return inserted.id;
    } catch (error) {
      // Two registrations of the same fresh address can pass the check above
      // concurrently; the UNIQUE index is the real arbiter, and the row it
      // protected is unverified by definition — the same case as finding it.
      if (!isUniqueViolation(error)) throw error;
      const raced = c.var.db
        .select({ id: users.id, verifiedAt: users.verifiedAt })
        .from(users)
        .where(eq(users.email, email))
        .get();
      return raced && !raced.verifiedAt ? raced.id : null;
    }
  };

  app.post('/register', async (c) => {
    const parsed = parseRegistration(parseJson(await c.req.text()));
    if ('error' in parsed) {
      return c.json({ error: parsed.error }, 400);
    }
    // Account creation per IP, then the send budget on both its keys — every
    // check before the argon2 hash and the mail.
    const limited =
      rejectRateLimited(c, limiters.register) ??
      rejectRateLimited(c, limiters.sendIp) ??
      rejectRateLimited(c, limiters.sendAddress, parsed.email);
    if (limited) return limited;

    const userId = await unverifiedAccountId(c, parsed.email, parsed.password);
    if (userId === null) {
      return c.json({ error: 'That email is already registered.' }, 409);
    }

    // No session: the account cannot be used until the link is followed, so
    // there is nothing to sign in to yet.
    await sendVerification(c, userId, parsed.email);
    return c.json({ email: parsed.email }, 201);
  });

  app.post('/resend-verification', async (c) => {
    const parsed = normalizeEmail(
      asRecord(parseJson(await c.req.text()))?.email,
    );
    if (parsed === null) {
      return c.json({ error: 'Enter a valid email address.' }, 400);
    }

    // The same send budget, on the same two keys: this endpoint exists to send
    // mail, so it is the one an attacker aims at the provider's daily cap with.
    const limited =
      rejectRateLimited(c, limiters.sendIp) ??
      rejectRateLimited(c, limiters.sendAddress, parsed);
    if (limited) return limited;

    // Success-shaped for every address — a response that differed for a
    // registered one would turn this into an account-enumeration oracle. The
    // only account that gets a message is one that still needs verifying.
    const user = c.var.db
      .select({ id: users.id, verifiedAt: users.verifiedAt })
      .from(users)
      .where(eq(users.email, parsed))
      .get();
    if (user && !user.verifiedAt) await sendVerification(c, user.id, parsed);
    return c.json({ sent: true });
  });

  app.post('/verify-email', async (c) => {
    const token = asRecord(parseJson(await c.req.text()))?.token;
    if (typeof token !== 'string' || token === '') {
      return invalidLink(c);
    }

    const at = now();
    const redeemed = redeemToken(c.var.db, 'verification', token, at);
    if (!redeemed) return invalidLink(c);

    // Following the link is the proof, so the account is signed in as it is
    // verified: the user never has to type the password again.
    const user = c.var.db
      .update(users)
      .set({ verifiedAt: at })
      .where(eq(users.id, redeemed.userId))
      .returning({ id: users.id, email: users.email, isAdmin: users.isAdmin })
      .get();
    await setSessionCookie(
      c,
      options.sessionSecret,
      createSession(c.var.db, user.id, at),
    );
    return c.json({ user: publicUser(user) });
  });

  app.post('/login', async (c) => {
    const limited = rejectRateLimited(c, limiters.login);
    if (limited) return limited;

    const parsed = parseLogin(parseJson(await c.req.text()));
    if ('error' in parsed) {
      return c.json({ error: parsed.error }, 400);
    }

    const user = c.var.db
      .select()
      .from(users)
      .where(eq(users.email, parsed.email))
      .get();
    // Always run a verification, even for an unknown email: otherwise the
    // response time reveals whether the address is registered. Against a
    // registered account we use its hash; otherwise a dummy of the same
    // argon2 parameters. Same message either way.
    const matches = await verifyPassword(
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      parsed.password,
    );
    if (!user || !matches) {
      return c.json({ error: 'Incorrect email or password.' }, 401);
    }
    // The gate. It sits behind the password check, so the answer never tells a
    // stranger that an address exists and is unverified — the same rule the
    // 401 above follows.
    if (!user.verifiedAt) {
      return c.json(
        {
          error:
            'Your email address is not verified yet. Open the link we sent you, or ask for a new one below.',
          code: EMAIL_UNVERIFIED_CODE,
        },
        403,
      );
    }

    await setSessionCookie(
      c,
      options.sessionSecret,
      createSession(c.var.db, user.id, now()),
    );
    return c.json({ user: publicUser(user) });
  });

  app.post('/logout', (c) => {
    // The middleware only resolves a verified session; an absent/invalid
    // cookie is still a successful logout.
    const token = c.var.sessionToken;
    if (token) deleteSession(c.var.db, token);
    clearSessionCookie(c);
    return c.body(null, 204);
  });

  app.post('/change-password', async (c) => {
    const limited = rejectRateLimited(c, limiters.changePassword);
    if (limited) return limited;

    const user = c.var.user;
    if (!user) return c.json({ error: 'Not signed in.' }, 401);

    const body = asRecord(parseJson(await c.req.text()));
    const currentPassword = body?.currentPassword;
    const newPassword = body?.newPassword;
    if (typeof currentPassword !== 'string') {
      return c.json({ error: 'Enter your current password.' }, 400);
    }
    if (
      typeof newPassword !== 'string' ||
      newPassword.length < MIN_PASSWORD_LENGTH
    ) {
      return c.json(
        {
          error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        },
        400,
      );
    }

    const matches = await verifyPassword(user.passwordHash, currentPassword);
    if (!matches) {
      return c.json({ error: 'Current password is incorrect.' }, 401);
    }

    c.var.db
      .update(users)
      .set({ passwordHash: await hashPassword(newPassword) })
      .where(eq(users.id, user.id))
      .run();
    // A password change signs out every other device: a session someone else
    // obtained with the old password must not survive it. The current session
    // (the one making the change) stays valid.
    if (c.var.sessionToken) {
      deleteOtherSessions(c.var.db, user.id, c.var.sessionToken);
    }
    return c.body(null, 204);
  });

  app.get('/me', (c) => {
    const user = c.var.user;
    return user
      ? c.json({ user: publicUser(user) })
      : c.json({ error: 'Not signed in.' }, 401);
  });

  return app;
}
