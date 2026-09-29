import { Hono, type Context } from 'hono';
import { and, eq } from 'drizzle-orm';
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
  deleteUserSessions,
} from './sessions.js';
import type { Clock } from './sessions.js';
import { clearSessionCookie, clientIp, setSessionCookie } from './http.js';
import { UpstreamError } from '../fetch-with-timeout.js';
import type { LogSink } from '../request-logger.js';
import {
  DEFAULT_AUTH_RATE_LIMITS,
  FixedWindowRateLimiter,
  createSendLimiter,
  type AuthRateLimitConfig,
  type SendLimiter,
} from './rate-limit.js';
import { createLinkSender, redeemToken } from './tokens.js';

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
  /**
   * The instance-wide send budget, built at the composition root and shared with
   * every route that can mail a user — the admin panel's two included, so a flood
   * started from one of them is bounded by the same counters as a flood started
   * from the sign-up form. Omitted, this router builds a private one, which is
   * what a suite testing auth alone wants.
   */
  sendLimiter?: SendLimiter;
  /** Injectable clock (tests control session expiry). */
  now?: Clock;
  /**
   * Whether this deployment has Google Sign-In configured (google-signin/01).
   * Only the /providers advertisement reads it — the flow's own routes are not
   * mounted at all without a client, so an unconfigured instance answers 404
   * there and the SPA renders no button.
   */
  googleSignIn?: boolean;
  /** Diagnostics sink; a mail failure the flow cannot fail on is logged here. */
  log?: LogSink;
}

const MIN_PASSWORD_LENGTH = 8;

/**
 * The policy every route that writes a password applies, in one wording, so
 * the sentence a user reads for the same refusal cannot drift between them.
 */
const NEW_PASSWORD_TOO_SHORT = `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`;

/** The two answers to a wrong or missing current password, shared by the routes
 *  that ask for one (change-password, change-email) so the words a user reads
 *  for the same failure cannot drift apart. */
const ENTER_CURRENT_PASSWORD = 'Enter your current password.';
const CURRENT_PASSWORD_WRONG = 'Current password is incorrect.';
// Deliberately permissive: an address with a local part, an @, and a domain
// with a dot. Anything stricter rejects valid addresses; verification is a
// link the owner follows, which is what proves the address. See normalizeEmail.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Codes the client branches on, never the message beside them: the sign-in gate
 * offers a resend, and a spent link offers a fresh one.
 */
export const EMAIL_UNVERIFIED_CODE = 'email_unverified';
export const LINK_INVALID_CODE = 'link_invalid';

/** The new address is spoken for — by another account, or by one registered
 *  while the link was in flight. The recovery is a fresh request. */
export const EMAIL_TAKEN_CODE = 'email_taken';

/**
 * One answer for every way a link fails to redeem — unknown, expired, already
 * spent, or issued for another flow. Distinguishing them would tell a stranger
 * holding a dead link something about the account behind it, and the recovery is
 * the same either way: ask for a fresh link. The wording names no flow, because
 * the same answer serves every link that can be asked for — a verification, a
 * reset, and an email change.
 */
function invalidLink(c: Context<AppEnv>) {
  return c.json(
    {
      error:
        'That link is no longer valid — it may have expired or already been used.',
      code: LINK_INVALID_CODE,
    },
    400,
  );
}

interface Credentials {
  email: string;
  password: string;
}

/**
 * An address, normalized to what the users table stores, or null when it is not
 * an address at all. Deliberately permissive: a local part, an @, and a domain
 * with a dot. Anything stricter rejects valid addresses; verification is a link
 * the owner follows, which is what proves the address. Exported because the
 * Admin panel's email change accepts an address too, and two normalizers would
 * be two spellings of the same address.
 */
export function normalizeEmail(value: unknown): string | null {
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
    // One budget for both routes that ask for the current password, because
    // they are the same attack — guessing a password through a stolen session —
    // and two budgets would only mean twice the guesses.
    passwordConfirm: new FixedWindowRateLimiter(limits.changePassword),
  };
  // The send budget is not here: it belongs to the instance, not to this router,
  // because the admin panel can send the same messages and has to spend the same
  // counters. A composition that shares it (createApp) passes it in.
  const sendLimiter =
    options.sendLimiter ?? createSendLimiter(options.authRateLimit);
  const sendLink = createLinkSender({ origin: options.publicOrigin, now });

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

  /** The send budget every "mail me a link" endpoint spends, on both its keys.
   *  One budget for all of them — a reset request is as capable of draining the
   *  provider's daily cap as a registration is, and so is the admin panel's
   *  reset link, so none of them draws on counters of its own. */
  const rejectOverSendBudget = (c: Context<AppEnv>, address: string) =>
    rejectRateLimited(c, sendLimiter.perIp) ??
    rejectRateLimited(c, sendLimiter.perAddress, address);

  /** The account an address belongs to, or null. Every flow that answers about
   *  an address without revealing whether it is registered reads it here. */
  const accountFor = (c: Context<AppEnv>, email: string) =>
    c.var.db
      .select({ id: users.id, verifiedAt: users.verifiedAt })
      .from(users)
      .where(eq(users.email, email))
      .get();

  /**
   * The branch a reset request and the Admin panel's reset link share: a verified
   * account gets a reset link, an unverified one gets a verification link
   * (story 14). A reset link for an unverified account is a dead end — the
   * password it sets buys nothing while sign-in stays locked on Email
   * Verification — so the two flows repair each other instead.
   *
   * The branch has two sides that must not drift, which is why the *purpose* is
   * what's chosen here and `sendLink` turns it into a page, a window, and a
   * message: there is no way to pick the verification link and get a reset
   * token.
   */
  const mailResetLink = async (
    c: Context<AppEnv>,
    userId: number,
    email: string,
  ): Promise<'password_reset' | 'verification'> => {
    const purpose = accountFor(c, email)?.verifiedAt
      ? 'password_reset'
      : 'verification';
    await sendLink(c.var.mailer, c.var.db, { purpose, userId, to: email });
    return purpose;
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
    const existing = accountFor(c, email);
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
      const raced = accountFor(c, email);
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
      rejectRateLimited(c, sendLimiter.perIp) ??
      rejectRateLimited(c, sendLimiter.perAddress, parsed.email);
    if (limited) return limited;

    const userId = await unverifiedAccountId(c, parsed.email, parsed.password);
    if (userId === null) {
      return c.json({ error: 'That email is already registered.' }, 409);
    }

    // No session: the account cannot be used until the link is followed, so
    // there is nothing to sign in to yet.
    await sendLink(c.var.mailer, c.var.db, {
      purpose: 'verification',
      userId,
      to: parsed.email,
    });
    return c.json({ email: parsed.email }, 201);
  });

  app.post('/resend-verification', async (c) => {
    const parsed = normalizeEmail(
      asRecord(parseJson(await c.req.text()))?.email,
    );
    if (parsed === null) {
      return c.json({ error: 'Enter a valid email address.' }, 400);
    }

    // The same send budget as the resend, on the same two keys: this endpoint
    // exists to send mail, so it is one an attacker aims at the provider's daily
    // cap with.
    const limited = rejectOverSendBudget(c, parsed);
    if (limited) return limited;

    // Success-shaped for every address — a response that differed for a
    // registered one would turn this into an account-enumeration oracle. The
    // only account that gets a message is one that still needs verifying.
    const user = accountFor(c, parsed);
    if (user && !user.verifiedAt) {
      await sendLink(c.var.mailer, c.var.db, {
        purpose: 'verification',
        userId: user.id,
        to: parsed,
      });
    }
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

  /**
   * Password Reset, requested from the sign-in page. Success-shaped for every
   * address (story 10): a response that differed for a registered one would
   * turn the form into an account-enumeration oracle.
   *
   * Which link goes out depends on the account: a verified one gets a reset
   * link, an unverified one gets a verification link (story 14). A reset link
   * for an unverified account would be a dead end — the password it sets buys
   * nothing while sign-in stays locked on the gate — so the two flows repair
   * each other instead. The response is identical either way, so the branch
   * tells a stranger nothing.
   */
  app.post('/request-password-reset', async (c) => {
    const parsed = normalizeEmail(
      asRecord(parseJson(await c.req.text()))?.email,
    );
    if (parsed === null) {
      return c.json({ error: 'Enter a valid email address.' }, 400);
    }

    const limited = rejectOverSendBudget(c, parsed);
    if (limited) return limited;

    const user = accountFor(c, parsed);
    if (user) await mailResetLink(c, user.id, parsed);
    return c.json({ sent: true });
  });

  /**
   * The Password Reset itself: a live link plus a new password sets the hash
   * and ends every session the account has.
   *
   * The policy is checked before the token is redeemed, so a password that
   * does not meet it costs the user nothing — a refused request leaves the link
   * spendable, which matters because a reset link is often a user's only way in.
   * The hash is written the same way whatever the account held before, so an
   * account with no password of its own (Google) gains one (story 13).
   */
  app.post('/reset-password', async (c) => {
    const body = asRecord(parseJson(await c.req.text()));
    const token = body?.token;
    if (typeof token !== 'string' || token === '') {
      return invalidLink(c);
    }
    const newPassword = body?.newPassword;
    if (
      typeof newPassword !== 'string' ||
      newPassword.length < MIN_PASSWORD_LENGTH
    ) {
      return c.json({ error: NEW_PASSWORD_TOO_SHORT }, 400);
    }

    const redeemed = redeemToken(c.var.db, 'password_reset', token, now());
    if (!redeemed) return invalidLink(c);

    c.var.db
      .update(users)
      .set({ passwordHash: await hashPassword(newPassword) })
      .where(eq(users.id, redeemed.userId))
      .run();
    // Every session, with no exception: a session that outlived a recovery is
    // the stolen one the recovery exists to kill (story 12). No session is
    // started in exchange — the user signs in with the password they just chose.
    deleteUserSessions(c.var.db, redeemed.userId);
    // The browser's half of the same revocation: the caller's own cookie, if it
    // had one, now points at a row that is gone, so it is cleared rather than
    // left to fail on the next request.
    clearSessionCookie(c);
    return c.body(null, 204);
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
    const limited = rejectRateLimited(c, limiters.passwordConfirm);
    if (limited) return limited;

    const user = c.var.user;
    if (!user) return c.json({ error: 'Not signed in.' }, 401);

    const body = asRecord(parseJson(await c.req.text()));
    const currentPassword = body?.currentPassword;
    const newPassword = body?.newPassword;
    if (typeof currentPassword !== 'string') {
      return c.json({ error: ENTER_CURRENT_PASSWORD }, 400);
    }
    if (
      typeof newPassword !== 'string' ||
      newPassword.length < MIN_PASSWORD_LENGTH
    ) {
      return c.json({ error: NEW_PASSWORD_TOO_SHORT }, 400);
    }

    const matches = await verifyPassword(user.passwordHash, currentPassword);
    if (!matches) {
      return c.json({ error: CURRENT_PASSWORD_WRONG }, 401);
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

  /**
   * The first password on an account that has none (google-signin/01b) — the
   * Account page's route for a Google-registered user, who cannot answer Change
   * Password's question about a current password they never chose.
   *
   * The session is the whole check. There is no secret to guess here — the
   * caller is already in — so this route deliberately spends none of the
   * password routes' limiter, which exists to bound guessing.
   *
   * An account that already has a password is refused: otherwise this would be
   * a second way to overwrite a password without the current one, and the
   * Account page is offered the form that matches what /api/me reported. That
   * refusal is the write's own condition, not a check above it — two requests
   * racing must not both pass one, so the row is only written while it still
   * has no password. The policy is the same minimum everywhere else, and the
   * outcome is Change Password's: this session stays, every other one the
   * account has is revoked. No mail goes out — the address is already verified,
   * and the account did not ask to be reachable somewhere new.
   */
  app.post('/set-password', async (c) => {
    const user = c.var.user;
    if (!user) return c.json({ error: 'Not signed in.' }, 401);

    const newPassword = asRecord(parseJson(await c.req.text()))?.newPassword;
    if (
      typeof newPassword !== 'string' ||
      newPassword.length < MIN_PASSWORD_LENGTH
    ) {
      return c.json({ error: NEW_PASSWORD_TOO_SHORT }, 400);
    }

    const written = c.var.db
      .update(users)
      .set({ passwordHash: await hashPassword(newPassword) })
      .where(and(eq(users.id, user.id), eq(users.passwordHash, '')))
      .returning({ id: users.id })
      .get();
    if (!written) {
      return c.json(
        { error: 'This account already has a password. Change it instead.' },
        409,
      );
    }

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

  /**
   * What sign-in methods this instance has (google-signin/01), for a sign-in
   * page nobody is signed in to yet. Always mounted; `google` is false on a
   * deployment with no OAuth client, which is how the button stays absent
   * rather than broken (spec §SPA surface).
   */
  app.get('/providers', (c) =>
    c.json({ google: options.googleSignIn === true }),
  );

  /**
   * Email change, requested from the Account page (stories 15–17).
   *
   * The current password is the gate. A session on its own — a stolen cookie, a
   * borrowed laptop — must not be able to redirect where an account's mail
   * goes, so the check stands in front of the token and the mail.
   *
   * Nothing is swapped here: the link goes to the new address and the swap waits
   * for the owner of that address to open it, so a typo cannot lock anyone out
   * of their own account. Nor is uniqueness checked here — refusing an address
   * someone else has registered would turn this form into a way to learn whose
   * accounts exist, and the address may be claimed while the link is in flight
   * anyway. Swap time is where that is decided.
   */
  app.post('/change-email', async (c) => {
    const limited = rejectRateLimited(c, limiters.passwordConfirm);
    if (limited) return limited;

    const user = c.var.user;
    if (!user) return c.json({ error: 'Not signed in.' }, 401);

    const body = asRecord(parseJson(await c.req.text()));
    const currentPassword = body?.currentPassword;
    const newEmail = normalizeEmail(body?.email);
    if (typeof currentPassword !== 'string' || currentPassword === '') {
      return c.json({ error: ENTER_CURRENT_PASSWORD }, 400);
    }
    if (newEmail === null) {
      return c.json({ error: 'Enter a valid email address.' }, 400);
    }
    // The one address this can refuse without telling a stranger anything: the
    // caller's own, which a link back to the same inbox would only confuse.
    if (newEmail === user.email) {
      return c.json({ error: 'That is already your login email.' }, 400);
    }

    // The password check comes before the send budget, not after it: the budget
    // is shared with every other mail this instance sends, so spending it on a
    // request that was never going to send anything would let a session that
    // cannot produce the password silence the product's mail for an hour. The
    // guesses themselves stay bounded by the limiter above, which is what exists
    // to bound them.
    const matches = await verifyPassword(user.passwordHash, currentPassword);
    if (!matches) {
      return c.json({ error: CURRENT_PASSWORD_WRONG }, 401);
    }

    // Now the send budget, on the new address: the message this endpoint exists
    // to produce is a flood an attacker would aim at an inbox, not at this key.
    const overBudget = rejectOverSendBudget(c, newEmail);
    if (overBudget) return overBudget;

    // The new address rides along as the link's payload, so the swap needs
    // nothing but the token to know where the account is going.
    await sendLink(c.var.mailer, c.var.db, {
      purpose: 'email_change',
      userId: user.id,
      to: newEmail,
      payload: newEmail,
    });
    return c.json({ email: newEmail });
  });

  /**
   * The Email change itself: the link the new address received, opened.
   *
   * Following it is the proof that the new address is reachable, so the swap and
   * the verification happen in one statement and the account is verified at the
   * moment this address — not the one it replaces — was proven.
   */
  app.post('/confirm-email-change', async (c) => {
    const token = asRecord(parseJson(await c.req.text()))?.token;
    if (typeof token !== 'string' || token === '') {
      return invalidLink(c);
    }

    const at = now();
    const redeemed = redeemToken(c.var.db, 'email_change', token, at);
    if (!redeemed) return invalidLink(c);

    const user = c.var.db
      .select()
      .from(users)
      .where(eq(users.id, redeemed.userId))
      .get();
    const newEmail = redeemed.payload ? normalizeEmail(redeemed.payload) : null;
    // A real link always carries its new address; one that does not is as dead
    // as one that cannot be found, and says so the same way.
    if (!user || newEmail === null) return invalidLink(c);

    // Uniqueness, decided here rather than at request time. An account that
    // registered the new address while the link was in flight keeps it: the
    // swap is refused, the token is spent, and the way forward is a fresh
    // request with another address.
    //
    // The check and the update below share one synchronous block — nothing awaits
    // between them — so a second confirmation for the same address cannot slip
    // past the check and reach the UNIQUE index. That is the whole reason this
    // needs no isUniqueViolation catch (the way registration does, where an
    // argon2 hash awaits between its check and its insert). Anything that
    // introduces an await in that window has to bring the catch with it.
    const spokenFor = accountFor(c, newEmail);
    if (spokenFor && spokenFor.id !== user.id) {
      return c.json(
        {
          error:
            'That address is already used by another account. Start again with a different address — from the Account page, or by asking the Admin.',
          code: EMAIL_TAKEN_CODE,
        },
        409,
      );
    }

    const swapped = c.var.db
      .update(users)
      .set({ email: newEmail, verifiedAt: at })
      .where(eq(users.id, user.id))
      .returning({ email: users.email, isAdmin: users.isAdmin })
      .get();

    // The courtesy notice goes after the swap, never before: telling the old
    // address about a change that might not happen would be its own lie. And a
    // provider that cannot deliver it must not undo — or deny — a change that
    // is already durable, so the failure is logged and the swap stands.
    try {
      await c.var.mailer.sendEmailChangedNotice({ to: user.email });
    } catch (cause) {
      options.log?.(
        `email-changed courtesy notice failed for user ${user.id}: ${
          cause instanceof UpstreamError ? cause.code : 'unknown'
        }`,
      );
    }
    return c.json({ user: publicUser(swapped) });
  });

  return app;
}
