import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import type { AppEnv } from '../index.js';
import { orderView, type OrderView } from '../orders/routes.js';
import { methodForCoinNetwork } from '../orders/payment.js';
import { getWallets } from '../db/settings.js';
import {
  DURATION_MONTHS,
  auditLogs,
  entitlements,
  orders,
  users,
  type Order,
} from '../db/schema.js';
import type { AppDatabase } from '../db/database.js';
import { asRecord, parseJson } from '../request-body.js';
import { expiryForGrant } from './entitlement.js';

// ─────────────────────────────────────────────────────────────────────────────
// Admin panel API (billing/02): the Verification queue and audit trail behind
// `/admin`. Every route is gated twice — signed in, and the Admin (the single
// operator, CONTEXT.md §Admin): non-admins get 403.
//
// Verifications grant the Entitlement in the same transaction that decides
// the Order and writes the audit entry, so the queue can never show a decided
// Order whose grant failed to land (or the reverse).
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminRoutesOptions {
  /** Injectable clock; expiry math and audit timestamps use it. */
  now?: () => Date;
}

/** The largest reject reason a decision accepts; it is advisory text, not data. */
const MAX_REASON_LENGTH = 1000;

/** The Entitlement state shown alongside each Order in the queue. */
export interface EntitlementView {
  plan: string;
  expiresAt: string;
}

export interface AdminOrderView {
  userEmail: string;
  /** The user's current Entitlement — what a duration grant stacks onto. */
  entitlement: EntitlementView | null;
}

type GrantInput = { durationMonths: number } | { expiresAt: Date };

/** The last millisecond of the given day, UTC. */
function endOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

/**
 * A verify request grants either a preset duration (stacked onto the current
 * Entitlement) or an exact custom expiry — never both. Date-only strings run
 * through the end of the chosen day: an admin picking "2027-01-05" means the
 * plan is good through January 5th, not that it dies at midnight going in.
 */
function parseGrant(body: unknown, now: Date): GrantInput | { error: string } {
  const record = asRecord(body);
  if (!record) {
    return { error: 'Expected a JSON object.' };
  }
  const hasDuration = record.durationMonths !== undefined;
  const hasExpiresAt = record.expiresAt !== undefined;
  if (hasDuration && hasExpiresAt) {
    return { error: 'Choose either a duration or an expiry date, not both.' };
  }
  if (hasDuration) {
    if (
      typeof record.durationMonths !== 'number' ||
      !DURATION_MONTHS.includes(record.durationMonths as 1 | 3 | 6 | 12)
    ) {
      return { error: 'Choose a duration of 1, 3, 6, or 12 months.' };
    }
    return { durationMonths: record.durationMonths };
  }
  if (hasExpiresAt) {
    if (typeof record.expiresAt !== 'string') {
      return { error: 'Enter an expiry date.' };
    }
    const value = record.expiresAt.trim();
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const parsed = new Date(dateOnly ? `${value}T00:00:00Z` : value);
    if (Number.isNaN(parsed.getTime())) {
      return { error: 'Enter a valid expiry date.' };
    }
    const expiresAt = dateOnly ? endOfUtcDay(parsed) : parsed;
    if (expiresAt.getTime() <= now.getTime()) {
      return { error: 'The expiry date must be in the future.' };
    }
    return { expiresAt };
  }
  return { error: 'Choose a duration or an expiry date for the entitlement.' };
}

function parseReason(body: unknown): string | { error: string } {
  const record = asRecord(body);
  if (!record || typeof record.reason !== 'string') {
    return {
      error: 'Give the user a reason so they can correct the submission.',
    };
  }
  const reason = record.reason.trim();
  if (reason === '') {
    return {
      error: 'Give the user a reason so they can correct the submission.',
    };
  }
  if (reason.length > MAX_REASON_LENGTH) {
    return {
      error: `Reasons are limited to ${MAX_REASON_LENGTH} characters.`,
    };
  }
  return reason;
}

function entitlementFor(
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

function adminOrderView(
  db: AppDatabase,
  wallets: ReturnType<typeof getWallets>,
  order: Order,
  userEmail: string,
): OrderView & AdminOrderView {
  const method = methodForCoinNetwork(order.coin, order.network);
  return {
    ...orderView(order, method ? wallets[method] : ''),
    userEmail,
    entitlement: entitlementFor(db, order.userId),
  };
}

/** The Order owner's email — the queue shows who each Order belongs to. */
function orderEmail(db: AppDatabase, userId: number): string {
  const row = db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!row) throw new Error(`order ${userId} references a missing user`);
  return row.email;
}

export function adminRoutes({
  now = () => new Date(),
}: AdminRoutesOptions = {}) {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    const user = c.var.user;
    if (!user) return c.json({ error: 'Not signed in.' }, 401);
    if (!user.isAdmin) {
      return c.json({ error: 'Admin access only.' }, 403);
    }
    return next();
  });

  app.get('/orders', (c) => {
    const db = c.var.db;
    const rows = db
      .select({ order: orders, userEmail: users.email })
      .from(orders)
      .innerJoin(users, eq(orders.userId, users.id))
      .orderBy(desc(orders.id))
      .all();
    const wallets = getWallets(db);
    return c.json({
      orders: rows.map(({ order, userEmail }) =>
        adminOrderView(db, wallets, order, userEmail),
      ),
    });
  });

  app.post('/orders/:id/verify', async (c) => {
    const admin = c.var.user;
    if (!admin) return c.json({ error: 'Not signed in.' }, 401);

    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'Order not found.' }, 404);
    }

    const grant = parseGrant(parseJson(await c.req.text()), now());
    if ('error' in grant) {
      return c.json({ error: grant.error }, 400);
    }

    const db = c.var.db;
    const order = db.select().from(orders).where(eq(orders.id, id)).get();
    if (!order) {
      return c.json({ error: 'Order not found.' }, 404);
    }
    if (order.status !== 'pending') {
      return c.json({ error: 'Only pending orders can be decided.' }, 409);
    }
    if (!order.txid) {
      return c.json(
        {
          error:
            'No transaction details have been submitted for this order — there is nothing on-chain to verify.',
        },
        409,
      );
    }

    const previous = db
      .select()
      .from(entitlements)
      .where(eq(entitlements.userId, order.userId))
      .get();
    const nowDate = now();
    const expiresAt =
      'durationMonths' in grant
        ? expiryForGrant(
            nowDate,
            previous ? previous.expiresAt : null,
            grant.durationMonths,
          )
        : grant.expiresAt;

    const decided = db.transaction((tx) => {
      const entitlement = tx
        .insert(entitlements)
        .values({
          userId: order.userId,
          plan: order.plan,
          expiresAt,
          updatedAt: nowDate,
        })
        .onConflictDoUpdate({
          target: entitlements.userId,
          set: { plan: order.plan, expiresAt, updatedAt: nowDate },
        })
        .returning()
        .get();
      const updated = tx
        .update(orders)
        .set({ status: 'verified', decidedAt: nowDate })
        .where(eq(orders.id, order.id))
        .returning()
        .get();
      tx.insert(auditLogs)
        .values({
          adminUserId: admin.id,
          adminEmail: admin.email,
          action: 'order.verify',
          targetType: 'order',
          targetId: String(order.id),
          before: {
            order: { status: order.status },
            entitlement: previous
              ? {
                  plan: previous.plan,
                  expiresAt: previous.expiresAt.toISOString(),
                }
              : null,
          },
          after: {
            order: { status: 'verified' },
            entitlement: {
              plan: entitlement.plan,
              expiresAt: entitlement.expiresAt.toISOString(),
            },
          },
        })
        .run();
      return updated;
    });

    const wallets = getWallets(db);
    return c.json({
      order: adminOrderView(
        db,
        wallets,
        decided,
        orderEmail(db, decided.userId),
      ),
      entitlement: entitlementFor(db, decided.userId),
    });
  });

  app.post('/orders/:id/reject', async (c) => {
    const admin = c.var.user;
    if (!admin) return c.json({ error: 'Not signed in.' }, 401);

    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: 'Order not found.' }, 404);
    }

    const reason = parseReason(parseJson(await c.req.text()));
    if (typeof reason === 'object') {
      return c.json({ error: reason.error }, 400);
    }

    const db = c.var.db;
    const order = db.select().from(orders).where(eq(orders.id, id)).get();
    if (!order) {
      return c.json({ error: 'Order not found.' }, 404);
    }
    if (order.status !== 'pending') {
      return c.json({ error: 'Only pending orders can be decided.' }, 409);
    }

    const nowDate = now();
    const decided = db.transaction((tx) => {
      const updated = tx
        .update(orders)
        .set({ status: 'rejected', rejectReason: reason, decidedAt: nowDate })
        .where(eq(orders.id, order.id))
        .returning()
        .get();
      tx.insert(auditLogs)
        .values({
          adminUserId: admin.id,
          adminEmail: admin.email,
          action: 'order.reject',
          targetType: 'order',
          targetId: String(order.id),
          before: {
            order: { status: order.status, rejectReason: order.rejectReason },
          },
          after: { order: { status: 'rejected', rejectReason: reason } },
        })
        .run();
      return updated;
    });

    const wallets = getWallets(db);
    return c.json({
      order: adminOrderView(
        db,
        wallets,
        decided,
        orderEmail(db, decided.userId),
      ),
    });
  });

  app.get('/audit', (c) => {
    const rows = c.var.db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.id))
      .all();
    return c.json({
      entries: rows.map((row) => ({
        id: row.id,
        adminEmail: row.adminEmail,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        before: row.before,
        after: row.after,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  });

  return app;
}
