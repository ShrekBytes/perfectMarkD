import { randomBytes } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { Hono } from 'hono';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { AppEnv } from '../index.js';
import { orderView, type OrderView } from '../orders/routes.js';
import { methodForCoinNetwork } from '../orders/payment.js';
import { getPlanLimits, getWallets } from '../db/settings.js';
import { hashPassword } from '../auth/passwords.js';
import {
  auditLogs,
  entitlements,
  exportUsage,
  exportsHistory,
  orders,
  PLANS,
  sessions,
  users,
  type Order,
  type Plan,
  type User,
  type WalletAddresses,
} from '../db/schema.js';
import type { AppDatabase } from '../db/database.js';
import { asRecord, parseJson } from '../request-body.js';
import { expiryForGrant } from './entitlement.js';
import { parseGrant } from './grant.js';

// ─────────────────────────────────────────────────────────────────────────────
// Admin user management (billing/03): search, a detail view, and the actions
// that need a human — grant/extend/revoke an Entitlement, comp quota, manual
// password reset (no email infrastructure: a temporary password is shown once
// for out-of-band handoff), and GDPR-ish account deletion. Every action lands
// with its audit entry in the same transaction, and the panel's views here are
// shared with the Verification queue so the two can't drift.
// ─────────────────────────────────────────────────────────────────────────────

export interface UsersRoutesOptions {
  /** Injectable clock; stacking math, periods, and audit timestamps use it. */
  now?: () => Date;
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

export interface AdminUserView {
  id: number;
  email: string;
  isAdmin: boolean;
  createdAt: string;
  entitlement: EntitlementView | null;
  usage: UsageView;
}

export interface AdminUserDetailView extends AdminUserView {
  /** The user's Order history, newest first (anonymizes away on deletion). */
  orders: Array<OrderView & AdminOrderView>;
}

/** The usage period a timestamp falls in, UTC `YYYY-MM` (schema: export_usage). */
export function usagePeriod(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
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

function usageFor(
  db: AppDatabase,
  userId: number,
  period: string,
  limits: ReturnType<typeof getPlanLimits>,
  now: Date,
  entitlement: EntitlementView | null,
): UsageView {
  const row = db
    .select({ count: exportUsage.count, comps: exportUsage.comps })
    .from(exportUsage)
    .where(and(eq(exportUsage.userId, userId), eq(exportUsage.period, period)))
    .get();
  const used = row?.count ?? 0;
  const comps = row?.comps ?? 0;
  const active =
    entitlement !== null &&
    new Date(entitlement.expiresAt).getTime() > now.getTime();
  const planQuota = active
    ? (limits[entitlement.plan as Plan]?.quotaMonthly ?? 0)
    : 0;
  return { period, used, comps, allowance: planQuota + comps };
}

function userView(
  db: AppDatabase,
  user: User,
  now: Date,
  limits: ReturnType<typeof getPlanLimits>,
  period: string,
): AdminUserView {
  const entitlement = entitlementFor(db, user.id);
  return {
    id: user.id,
    email: user.email,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt.toISOString(),
    entitlement,
    usage: usageFor(db, user.id, period, limits, now, entitlement),
  };
}

function parseUserId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** LIKE pattern for an email substring search, with wildcards escaped. */
function emailPattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

export function usersRoutes({
  now = () => new Date(),
  removeStoredFile = removeStoredFileDefault,
}: UsersRoutesOptions = {}) {
  const app = new Hono<AppEnv>();

  app.get('/', (c) => {
    const db = c.var.db;
    const nowDate = now();
    const limits = getPlanLimits(db);
    const period = usagePeriod(nowDate);
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
      users: rows.map((user) => userView(db, user, nowDate, limits, period)),
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
    const period = usagePeriod(nowDate);
    const wallets = getWallets(db);
    const orderRows = db
      .select()
      .from(orders)
      .where(eq(orders.userId, user.id))
      .orderBy(desc(orders.id))
      .all();
    const view = userView(db, user, nowDate, limits, period);
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
      user: userView(
        db,
        user,
        nowDate,
        getPlanLimits(db),
        usagePeriod(nowDate),
      ),
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
      user: userView(
        db,
        user,
        nowDate,
        getPlanLimits(db),
        usagePeriod(nowDate),
      ),
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
      user: userView(db, user, nowDate, getPlanLimits(db), period),
    });
  });

  /**
   * Manual password reset (no email infrastructure): a temporary password is
   * generated, returned once for out-of-band handoff, and every session is
   * revoked — the user signs back in with the temp password.
   */
  app.post('/:id/password', async (c) => {
    const admin = c.var.user;
    if (!admin) return c.json({ error: 'Not signed in.' }, 401);

    const id = parseUserId(c.req.param('id'));
    if (id === null) return c.json({ error: 'User not found.' }, 404);

    const db = c.var.db;
    const user = db.select().from(users).where(eq(users.id, id)).get();
    if (!user) return c.json({ error: 'User not found.' }, 404);
    if (user.id === admin.id) {
      return c.json(
        {
          error:
            'Use “Change password” in your account menu to change your own password.',
        },
        409,
      );
    }

    // 12 random bytes → 16 base64url characters. Displayed once in the panel.
    const temporaryPassword = randomBytes(12).toString('base64url');
    const passwordHash = await hashPassword(temporaryPassword);

    db.transaction((tx) => {
      tx.update(users).set({ passwordHash }).where(eq(users.id, user.id)).run();
      const revoked = tx
        .delete(sessions)
        .where(eq(sessions.userId, user.id))
        .returning({ token: sessions.token })
        .all();
      tx.insert(auditLogs)
        .values({
          adminUserId: admin.id,
          adminEmail: admin.email,
          action: 'user.password_reset',
          targetType: 'user',
          targetId: String(user.id),
          before: null,
          after: { sessionsRevoked: revoked.length },
        })
        .run();
    });

    return c.json({ temporaryPassword });
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
