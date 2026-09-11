import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import type { AppEnv } from '../index.js';
import { getWallets } from '../db/settings.js';
import { auditLogs, entitlements, orders, users } from '../db/schema.js';
import { asRecord, parseJson } from '../request-body.js';
import { expiryForGrant } from './entitlement.js';
import { parseGrant } from './grant.js';
import {
  adminOrderView,
  entitlementFor,
  userEmailFor,
  usersRoutes,
} from './users.js';
import { settingsRoutes } from './settings-routes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Admin panel API (billing/02): the Verification queue and audit trail behind
// `/admin`. Every route is gated twice — signed in, and the Admin (the single
// operator, CONTEXT.md §Admin): non-admins get 403.
//
// Verifications grant the Entitlement in the same transaction that decides
// the Order and writes the audit entry, so the queue can never show a decided
// Order whose grant failed to land (or the reverse). User management
// (billing/03) and settings live in sibling sub-apps behind the same gate.
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminRoutesOptions {
  /** Injectable clock; expiry math and audit timestamps use it. */
  now?: () => Date;
  /** Removes an Export History file on account deletion (see usersRoutes). */
  removeStoredFile?: (storedPath: string) => void;
}

/** The largest reject reason a decision accepts; it is advisory text, not data. */
const MAX_REASON_LENGTH = 1000;

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

export function adminRoutes({
  now = () => new Date(),
  removeStoredFile,
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
    // Left join: Orders whose account was deleted (anonymized) stay in the
    // queue with a null email — the Admin sees them and can reject them.
    const rows = db
      .select({ order: orders, userEmail: users.email })
      .from(orders)
      .leftJoin(users, eq(orders.userId, users.id))
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
    if (order.userId === null) {
      return c.json(
        {
          error:
            'The account that placed this order was deleted — reject it instead.',
        },
        409,
      );
    }
    // Captured narrowed: the transaction callback sees the column type
    // (number | null), not this route's guarantees.
    const orderUserId: number = order.userId;

    const previous = db
      .select()
      .from(entitlements)
      .where(eq(entitlements.userId, orderUserId))
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
          userId: orderUserId,
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
        userEmailFor(db, decided.userId),
      ),
      entitlement: entitlementFor(db, orderUserId),
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
        userEmailFor(db, decided.userId),
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

  app.route('/users', usersRoutes({ now, removeStoredFile }));
  app.route('/settings', settingsRoutes({ now }));

  return app;
}
