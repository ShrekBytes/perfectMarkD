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

export interface AuthOptions {
  /** Signs session cookies; resolved from env by createApp. */
  sessionSecret: string;
  /** First registered account with this email becomes the Admin. */
  adminEmail: string | null;
  /** Per-route overrides for the auth rate limits (tests tighten these). */
  authRateLimit?: AuthRateLimitConfig;
  /** Injectable clock (tests control session expiry). */
  now?: Clock;
}

const MIN_PASSWORD_LENGTH = 8;
// Deliberately permissive: an address with a local part, an @, and a domain
// with a dot. Anything stricter rejects valid addresses; verification is
// manual (no email is ever sent), so this is a shape check, not a proof.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
 * Email + password accounts (server/02). No email verification and no email
 * sending — password resets are manual via the Admin (billing/03). Routes are
 * mounted under /api/auth.
 */
export function authRoutes(options: AuthOptions) {
  const app = new Hono<AppEnv>();
  const now = options.now ?? (() => new Date());
  const limits = { ...DEFAULT_AUTH_RATE_LIMITS, ...options.authRateLimit };
  const limiters = {
    login: new FixedWindowRateLimiter(limits.login),
    register: new FixedWindowRateLimiter(limits.register),
    changePassword: new FixedWindowRateLimiter(limits.changePassword),
  };

  /** Returns a 429 response when the key is over budget, else null. */
  const rejectRateLimited = (
    c: Context<AppEnv>,
    limiter: FixedWindowRateLimiter,
  ) => {
    const decision = limiter.check(clientIp(c));
    if (decision.allowed) return null;
    c.header('retry-after', String(decision.retryAfterSeconds));
    return c.json({ error: 'Too many attempts. Try again shortly.' }, 429);
  };

  app.post('/register', async (c) => {
    const limited = rejectRateLimited(c, limiters.register);
    if (limited) return limited;

    const parsed = parseRegistration(parseJson(await c.req.text()));
    if ('error' in parsed) {
      return c.json({ error: parsed.error }, 400);
    }

    const existing = c.var.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.email))
      .get();
    if (existing) {
      return c.json({ error: 'That email is already registered.' }, 409);
    }

    const isAdmin =
      options.adminEmail !== null &&
      parsed.email === options.adminEmail.trim().toLowerCase();

    let inserted;
    try {
      inserted = c.var.db
        .insert(users)
        .values({
          email: parsed.email,
          passwordHash: await hashPassword(parsed.password),
          isAdmin,
        })
        .returning({ id: users.id, email: users.email, isAdmin: users.isAdmin })
        .get();
    } catch (error) {
      // Two registrations of the same email can pass the check above
      // concurrently; the UNIQUE index is the real arbiter, so map its
      // violation to the same 409 the sequential path returns.
      if (isUniqueViolation(error)) {
        return c.json({ error: 'That email is already registered.' }, 409);
      }
      throw error;
    }

    await setSessionCookie(
      c,
      options.sessionSecret,
      createSession(c.var.db, inserted.id, now()),
    );
    return c.json({ user: publicUser(inserted) }, 201);
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
