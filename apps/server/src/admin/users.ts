import { unlinkSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { Hono } from 'hono';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { AppEnv } from '../index.js';
import { orderView, type OrderView } from '../orders/routes.js';
import { methodForCoinNetwork } from '../orders/payment.js';
import { getPlanLimits, getWallets } from '../db/settings.js';
import {
  normalizeEmail,
  CONFIRM_EMAIL_CHANGE_PATH,
  SET_PASSWORD_PATH,
  VERIFY_PATH,
} from '../auth/routes.js';
import {
  issueToken,
  oneTimeLink,
  PASSWORD_RESET_TOKEN_TTL_MS,
  VERIFICATION_TOKEN_TTL_MS,
} from '../auth/tokens.js';
import {
  auditLogs,
  entitlements,
  exportUsage,
  exportsHistory,
  orders,
  PLANS,
  users,
  type Order,
  type User,
  type WalletAddresses,
} from '../db/schema.js';
import type { AppDatabase } from '../db/database.js';
import { asRecord, parseJson } from '../request-body.js';
import { quotaState, usagePeriod, type EntitlementLike } from '../quota.js';
import { aiUsageState } from '../ai/state.js';
import { expiryForGrant } from './entitlement.js';
import { parseGrant } from './grant.js';

// ─────────────────────────────────────────────────────────────────────────────
// Admin user management (billing/03): search, a detail view, and the actions
// that need a human — grant/extend/revoke an Entitlement, comp quota, mail a
// password-reset link or move a dead mailbox, and GDPR-ish account deletion.
// Every action that changes state lands with its audit entry in the same
// transaction, and the panel's views here are shared with the Verification queue
// so the two can't drift.
//
// The two mail actions (email/05) are the panel's whole recovery story now that
// transactional email exists: the Admin never sees or sets a password, and an
// address only moves when the user proves they can read the new one. Both send
// the same links the sign-in page and the Account page send, so one route — not
// a panel copy of it — is what spends them. Neither is transactional with
// anything: the only row either writes is its own audit entry, and that lands
// after the send so a provider that refused the message leaves no entry
// claiming it went out.
// ─────────────────────────────────────────────────────────────────────────────

export interface UsersRoutesOptions {
  /** Injectable clock; stacking math, periods, and audit timestamps use it. */
  now?: () => Date;
  /**
   * PUBLIC_ORIGIN, the address users reach this instance on. The one-time links
   * this panel mails are built from it and from nothing else.
   */
  publicOrigin: string;
  /**
   * Removes an Export History file after account deletion. Defaults to
   * best-effort unlinking of absolute paths; server/03 owns the storage
   * layout and refines this when files start existing.
   */
  removeStoredFile?: (storedPath: string) => void;
}

function removeStoredFileDefault(storedPath: string): void {
  if (!isAbsolute(storedPath)) return;
  try {
    unlinkSync(storedPath);
  } catch {
    // The file may already be gone; deletion stays best-effort.
  }
}

/** The largest user list a search returns; the single operator refines by search. */
const MAX_RESULTS = 100;

/** The largest single quota comp, in either direction. */
const MAX_COMP_AMOUNT = 100_000;

/** Thrown inside the comp transaction when comps would drop below zero. */
class CompsFloorError extends Error {}

/** The Entitlement state shown in the panel (shared with the queue). */
export interface EntitlementView {
  plan: string;
  expiresAt: string;
}

export interface AdminOrderView {
  /** Null when the Order's account was deleted (anonymized Order). */
  userEmail: string | null;
  /** The user's current Entitlement — what a duration grant stacks onto. */
  entitlement: EntitlementView | null;
}

/** This period's Server Export usage, as the user detail shows it. */
export interface UsageView {
  period: string;
  used: number;
  /** Admin-granted extra allowance for the period (comp quota). */
  comps: number;
  /** The plan's monthly quota while the Entitlement is active, plus comps. */
  allowance: number;
}

/** This period's AI Action usage, as the user detail shows it (03). */
export interface AiUsageView {
  period: string;
  used: number;
  /** The plan's monthly AI Allowance while the Entitlement is active. */
  allowance: number;
  remaining: number;
}

export interface AdminUserView {
  id: number;
  email: string;
  isAdmin: boolean;
  createdAt: string;
  entitlement: EntitlementView | null;
  usage: UsageView;
  aiUsage: AiUsageView;
}

export interface AdminUserDetailView extends AdminUserView {
  /** The user's Order history, newest first (anonymizes away on deletion). */
  orders: Array<OrderView & AdminOrderView>;
}

export function entitlementFor(
  db: AppDatabase,
  userId: number,
): EntitlementView | null {
  const row = db
    .select()
    .from(entitlements)
    .where(eq(entitlements.userId, userId))
    .get();
  return row
    ? { plan: row.plan, expiresAt: row.expiresAt.toISOString() }
    : null;
}

/** The Order owner's email, or null when the account was deleted. */
export function userEmailFor(
  db: AppDatabase,
  userId: number | null,
): string | null {
  if (userId === null) return null;
  const row = db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return row?.email ?? null;
}

export function adminOrderView(
  db: AppDatabase,
  wallets: WalletAddresses,
  order: Order,
  userEmail: string | null,
): OrderView & AdminOrderView {
  const method = methodForCoinNetwork(order.coin, order.network);
  return {
    ...orderView(order, method ? wallets[method] : ''),
    userEmail,
    // The user's current Entitlement — what a duration grant stacks onto.
    entitlement:
      order.userId === null ? null : entitlementFor(db, order.userId),
  };
}

function entitlementRow(db: AppDatabase, userId: number) {
  return db
    .select()
    .from(entitlements)
    .where(eq(entitlements.userId, userId))
    .get();
}

/** The shared quota/AI math shape for an Entitlement view; null without one. */
function usageEntitlement(
  entitlement: EntitlementView | null,
): EntitlementLike {
  return entitlement
    ? { plan: entitlement.plan, expiresAt: new Date(entitlement.expiresAt) }
    : null;
}

function usageFor(
  db: AppDatabase,
  userId: number,
  limits: ReturnType<typeof getPlanLimits>,
  now: Date,
  entitlement: EntitlementView | null,
): UsageView {
  // The shared quota math (server/04) — the panel must show exactly what
  // /api/me shows the user and what the export route enforces.
  const state = quotaState(
    db,
    userId,
    usageEntitlement(entitlement),
    limits,
    now,
  );
  return {
    period: usagePeriod(now),
    used: state.used,
    comps: state.comps,
    allowance: state.limit,
  };
}

function aiUsageFor(
  db: AppDatabase,
  userId: number,
  limits: ReturnType<typeof getPlanLimits>,
  now: Date,
  entitlement: EntitlementView | null,
): AiUsageView {
  // The same AI math /api/me reports (ai-transforms/03), so support sees the
  // count the user sees — in their own counter, never mixed with exports.
  const state = aiUsageState(
    db,
    userId,
    usageEntitlement(entitlement),
    limits,
    now,
  );
  return {
    period: state.period,
    used: state.used,
    allowance: state.allowance,
    remaining: state.remaining,
  };
}

function userView(
  db: AppDatabase,
  user: User,
  now: Date,
  limits: ReturnType<typeof getPlanLimits>,
): AdminUserView {
  const entitlement = entitlementFor(db, user.id);
  return {
    id: user.id,
    email: user.email,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt.toISOString(),
    entitlement,
    usage: usageFor(db, user.id, limits, now, entitlement),
    aiUsage: aiUsageFor(db, user.id, limits, now, entitlement),
  };
}

function parseUserId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * The SPA page a link of each kind points at. The same map the sign-in page's
 * reset request follows, so the panel's link and the user's own land on the same
 * form — a link's authority and the page that spends it are one decision.
 */
const LINK_PATH = {
  verification: VERIFY_PATH,
  password_reset: SET_PASSWORD_PATH,
} as const;

function pathFor(kind: keyof typeof LINK_PATH): string {
  return LINK_PATH[kind];
}

/**
 * The audit entry for a link this panel mailed.
 *
 * `after` says a link went out and stops there: the account does not move until
 * the user follows it, so there is no "before" to record and no "after" that
 * exists yet. No address is written either, for the reason `user.delete` does
 * not write one — the trail documents the action without outliving the data it
 * names. The row lands after the send, not before it, so a provider that refused
 * the message leaves no entry claiming it went out.
 */
function recordMailedLink(
  db: AppDatabase,
  admin: User,
  userId: number,
  action: 'user.reset_link' | 'user.email_change',
): void {
  db.insert(auditLogs)
    .values({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action,
      targetType: 'user',
      targetId: String(userId),
      before: null,
      after: { linkSent: true },
    })
    .run();
}

/** LIKE pattern for an email substring search, with wildcards escaped. */
function emailPattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

export function usersRoutes({
  now = () => new Date(),
  publicOrigin,
  removeStoredFile = removeStoredFileDefault,
}: UsersRoutesOptions) {
  const app = new Hono<AppEnv>();

  app.get('/', (c) => {
    const db = c.var.db;
    const nowDate = now();
    const limits = getPlanLimits(db);
    const query = (c.req.query('query') ?? '').trim();
    const rows = (
      query === ''
        ? db.select().from(users)
        : db
            .select()
            .from(users)
            .where(
              // SQLite's LIKE is already case-insensitive for ASCII; ESCAPE
              // keeps the admin's `%` and `_` characters literal.
              sql`${users.email} like ${emailPattern(query)} escape '\\'`,
            )
    )
      .orderBy(desc(users.id))
      .limit(MAX_RESULTS)
      .all();
    return c.json({
      users: rows.map((user) => userView(db, user, nowDate, limits)),
    });
  });

  app.get('/:id', (c) => {
    const id = parseUserId(c.req.param('id'));
    if (id === null) return c.json({ error: 'User not found.' }, 404);

    const db = c.var.db;
    const user = db.select().from(users).where(eq(users.id, id)).get();
    if (!user) return c.json({ error: 'User not found.' }, 404);

    const nowDate = now();
    const limits = getPlanLimits(db);
    const wallets = getWallets(db);
    const orderRows = db
      .select()
      .from(orders)
      .where(eq(orders.userId, user.id))
      .orderBy(desc(orders.id))
      .all();
    const view = userView(db, user, nowDate, limits);
    return c.json({
      user: {
        ...view,
        orders: orderRows.map((order) =>
          adminOrderView(db, wallets, order, user.email),
        ),
      } satisfies AdminUserDetailView,
    });
  });

  /** Grant or extend the Entitlement by hand — no Order involved. */
  app.post('/:id/entitlement', async (c) => {
    const admin = c.var.user;
    if (!admin) return c.json({ error: 'Not signed in.' }, 401);

    const id = parseUserId(c.req.param('id'));
    if (id === null) return c.json({ error: 'User not found.' }, 404);

    const db = c.var.db;
    const user = db.select().from(users).where(eq(users.id, id)).get();
    if (!user) return c.json({ error: 'User not found.' }, 404);

    const body = asRecord(parseJson(await c.req.text()));
    if (!body) return c.json({ error: 'Expected a JSON object.' }, 400);
    const plan = body.plan;
    if (
      typeof plan !== 'string' ||
      !(PLANS as readonly string[]).includes(plan)
    ) {
      return c.json({ error: 'Choose a plan.' }, 400);
    }
    const grant = parseGrant(body, now());
    if ('error' in grant) return c.json({ error: grant.error }, 400);

    const previous = entitlementRow(db, user.id);
    const nowDate = now();
    const expiresAt =
      'durationMonths' in grant
        ? expiryForGrant(
            nowDate,
            previous ? previous.expiresAt : null,
            grant.durationMonths,
          )
        : grant.expiresAt;

    db.transaction((tx) => {
      tx.insert(entitlements)
        .values({
          userId: user.id,
          plan,
          expiresAt,
          updatedAt: nowDate,
        })
        .onConflictDoUpdate({
          target: entitlements.userId,
          set: { plan, expiresAt, updatedAt: nowDate },
        })
        .run();
      tx.insert(auditLogs)
        .values({
          adminUserId: admin.id,
          adminEmail: admin.email,
          action: 'entitlement.grant',
          targetType: 'user',
          targetId: String(user.id),
          before: previous
            ? {
                plan: previous.plan,
                expiresAt: previous.expiresAt.toISOString(),
              }
            : null,
          after: { plan, expiresAt: expiresAt.toISOString() },
        })
        .run();
    });

    // The response view uses the same instant the grant math and audit entry
    // used — a fresh now() could straddle a UTC midnight and flip the period.
    return c.json({
      user: userView(db, user, nowDate, getPlanLimits(db)),
    });
  });

  app.delete('/:id/entitlement', (c) => {
    const admin = c.var.user;
    if (!admin) return c.json({ error: 'Not signed in.' }, 401);

    const id = parseUserId(c.req.param('id'));
    if (id === null) return c.json({ error: 'User not found.' }, 404);

    const db = c.var.db;
    const user = db.select().from(users).where(eq(users.id, id)).get();
    if (!user) return c.json({ error: 'User not found.' }, 404);

    const previous = entitlementRow(db, user.id);
    if (!previous) {
      return c.json({ error: 'This user has no entitlement to revoke.' }, 409);
    }

    const nowDate = now();
    db.transaction((tx) => {
      tx.delete(entitlements).where(eq(entitlements.userId, user.id)).run();
      tx.insert(auditLogs)
        .values({
          adminUserId: admin.id,
          adminEmail: admin.email,
          action: 'entitlement.revoke',
          targetType: 'user',
          targetId: String(user.id),
          before: {
            plan: previous.plan,
            expiresAt: previous.expiresAt.toISOString(),
          },
          after: null,
        })
        .run();
    });

    return c.json({
      user: userView(db, user, nowDate, getPlanLimits(db)),
    });
  });

  /** Comp quota: add (or, with a negative amount, retract) extra exports. */
  app.post('/:id/quota/comp', async (c) => {
    const admin = c.var.user;
    if (!admin) return c.json({ error: 'Not signed in.' }, 401);

    const id = parseUserId(c.req.param('id'));
    if (id === null) return c.json({ error: 'User not found.' }, 404);

    const db = c.var.db;
    const user = db.select().from(users).where(eq(users.id, id)).get();
    if (!user) return c.json({ error: 'User not found.' }, 404);

    const body = asRecord(parseJson(await c.req.text()));
    const amount = body?.amount;
    if (!Number.isInteger(amount) || (amount as number) === 0) {
      return c.json(
        { error: 'Enter a whole number of exports to add (not 0).' },
        400,
      );
    }
    if (Math.abs(amount as number) > MAX_COMP_AMOUNT) {
      return c.json(
        { error: `Comps are limited to ±${MAX_COMP_AMOUNT} exports.` },
        400,
      );
    }

    const nowDate = now();
    const period = usagePeriod(nowDate);

    // Read, floor check, and write all happen inside the transaction so two
    // concurrent comps can never lose one another's update.
    try {
      db.transaction((tx) => {
        const current = tx
          .select({ comps: exportUsage.comps })
          .from(exportUsage)
          .where(
            and(
              eq(exportUsage.userId, user.id),
              eq(exportUsage.period, period),
            ),
          )
          .get();
        const currentComps = current?.comps ?? 0;
        const comps = currentComps + (amount as number);
        if (comps < 0) throw new CompsFloorError();

        tx.insert(exportUsage)
          .values({ userId: user.id, period, count: 0, comps })
          .onConflictDoUpdate({
            target: [exportUsage.userId, exportUsage.period],
            set: { comps },
          })
          .run();
        tx.insert(auditLogs)
          .values({
            adminUserId: admin.id,
            adminEmail: admin.email,
            action: 'quota.comp',
            targetType: 'user',
            targetId: String(user.id),
            before: { period, comps: currentComps },
            after: { period, comps },
          })
          .run();
      });
    } catch (error) {
      if (error instanceof CompsFloorError) {
        return c.json(
          { error: 'Comps for this period cannot go below zero.' },
          400,
        );
      }
      throw error;
    }

    return c.json({
      user: userView(db, user, nowDate, getPlanLimits(db)),
    });
  });

  /**
   * Send a password-reset link (email/05, story 21).
   *
   * This used to generate a temporary password and show it once for the Admin to
   * hand over. Now that the server can send mail, it mails the same link the
   * sign-in page's reset request sends: the user chooses their own password, and
   * the Admin never sees or sets one. Nothing about the account changes here —
   * the password, every session, and the address all stand until the link is
   * followed, at which point the reset route ends every session.
   *
   * The reply names which link went out, and an unverified account gets the one
   * that can actually let them in: a reset link buys nothing while sign-in stays
   * locked on Email Verification. The Admin is looking at this account already,
   * so telling them its state is not the enumeration story/10 is about.
   */
  app.post('/:id/password', async (c) => {
    const admin = c.var.user;
    if (!admin) return c.json({ error: 'Not signed in.' }, 401);

    const id = parseUserId(c.req.param('id'));
    if (id === null) return c.json({ error: 'User not found.' }, 404);

    const db = c.var.db;
    const user = db.select().from(users).where(eq(users.id, id)).get();
    if (!user) return c.json({ error: 'User not found.' }, 404);

    const kind = user.verifiedAt ? 'password_reset' : 'verification';
    const token = issueToken(db, { purpose: kind, userId: user.id }, now());
    const url = oneTimeLink(publicOrigin, pathFor(kind), token);
    if (kind === 'verification') {
      await c.var.mailer.sendVerification({ to: user.email, url });
    } else {
      await c.var.mailer.sendPasswordReset({ to: user.email, url });
    }
    recordMailedLink(db, admin, user.id, 'user.reset_link');
    // The window in minutes, so the panel states the server's own rather than a
    // copy of it that can fall behind.
    return c.json({
      sent: true,
      kind,
      expiresInMinutes: Math.round(
        (kind === 'verification'
          ? VERIFICATION_TOKEN_TTL_MS
          : PASSWORD_RESET_TOKEN_TTL_MS) / 60_000,
      ),
    });
  });

  /**
   * Move a dead mailbox (email/05, story 22): mail a link to the new address,
   * and the account follows it to that address when its owner opens it.
   *
   * The mechanics are the Account page's, deliberately (email/04): the swap waits
   * for the new address, so a typo cannot lock a user out of the account the
   * Admin is rescuing, and it re-verifies the address, because a link that was
   * opened is the proof Email Verification asks for. There is no password check
   * — the Admin is the operator, already authenticated, and the user in front of
   * them cannot produce one.
   *
   * Uniqueness is decided at swap time, not here, for the same reason it is not:
   * the address can be claimed while the link is in flight, so an early refusal
   * would be a refusal of a state that might not be the one the user lands in.
   */
  app.post('/:id/email', async (c) => {
    const admin = c.var.user;
    if (!admin) return c.json({ error: 'Not signed in.' }, 401);

    const id = parseUserId(c.req.param('id'));
    if (id === null) return c.json({ error: 'User not found.' }, 404);

    const db = c.var.db;
    const user = db.select().from(users).where(eq(users.id, id)).get();
    if (!user) return c.json({ error: 'User not found.' }, 404);

    const newEmail = normalizeEmail(
      asRecord(parseJson(await c.req.text()))?.email,
    );
    if (newEmail === null) {
      return c.json({ error: 'Enter a valid email address.' }, 400);
    }
    // The one address this can refuse without hedging: the one already in use.
    if (newEmail === user.email) {
      return c.json({ error: 'That is already the user’s login email.' }, 400);
    }

    // The new address rides along as the link's payload, so the swap needs
    // nothing but the token to know where the account is going.
    const token = issueToken(
      db,
      { purpose: 'email_change', userId: user.id, payload: newEmail },
      now(),
    );
    await c.var.mailer.sendEmailChange({
      to: newEmail,
      url: oneTimeLink(publicOrigin, CONFIRM_EMAIL_CHANGE_PATH, token),
    });
    recordMailedLink(db, admin, user.id, 'user.email_change');
    return c.json({ email: newEmail });
  });

  /**
   * GDPR-ish account deletion: the user and their personal data (sessions,
   * entitlement, quota usage, Export History) are gone; Orders remain as the
   * financial record, anonymized — detached from the account, free text
   * cleared — and the Admin identity in the audit log survives by design
   * (schema: audit_logs.admin_user_id is not a foreign key).
   */
  app.delete('/:id', (c) => {
    const admin = c.var.user;
    if (!admin) return c.json({ error: 'Not signed in.' }, 401);

    const id = parseUserId(c.req.param('id'));
    if (id === null) return c.json({ error: 'User not found.' }, 404);

    const db = c.var.db;
    const user = db.select().from(users).where(eq(users.id, id)).get();
    if (!user) return c.json({ error: 'User not found.' }, 404);
    if (user.id === admin.id) {
      return c.json(
        { error: 'You cannot delete the account you are signed in with.' },
        409,
      );
    }

    // Collected before the transaction: the history rows cascade away inside
    // it, and the files (if any exist) are removed after it commits.
    const storedPaths = db
      .select({ storedPath: exportsHistory.storedPath })
      .from(exportsHistory)
      .where(eq(exportsHistory.userId, user.id))
      .all()
      .map((row) => row.storedPath);

    db.transaction((tx) => {
      const anonymized = tx
        .update(orders)
        // The note is the user's own free text; amounts, txid, and the
        // decision (the Admin's record) stay as the financial history.
        .set({ userId: null, note: null })
        .where(eq(orders.userId, user.id))
        .returning({ id: orders.id })
        .all();
      // Cascades: sessions, entitlements, export_usage, exports_history.
      tx.delete(users).where(eq(users.id, user.id)).run();
      // The deleted user's email is deliberately not recorded — the audit
      // trail documents the action without outliving the anonymization.
      tx.insert(auditLogs)
        .values({
          adminUserId: admin.id,
          adminEmail: admin.email,
          action: 'user.delete',
          targetType: 'user',
          targetId: String(user.id),
          before: {
            ordersAnonymized: anonymized.length,
            historyPurged: storedPaths.length,
          },
          after: null,
        })
        .run();
    });

    for (const storedPath of storedPaths) removeStoredFile(storedPath);

    return c.body(null, 204);
  });

  return app;
}
