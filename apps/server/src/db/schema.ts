import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// Value types shared by the schema and its consumers. Open text columns are
// constrained here rather than with CHECK constraints: admin-editable
// settings (billing) may grow the valid sets, and SQLite CHECKs would turn
// that growth into a migration.
// ---------------------------------------------------------------------------

/** Paid plans — see PLAN.md §Tiers. */
export const PLANS = ['pro', 'premium'] as const;
export type Plan = (typeof PLANS)[number];

/** Duration options in months; 12 months is priced at 10× the monthly rate. */
export const DURATION_MONTHS = [1, 3, 6, 12] as const;
export type DurationMonths = (typeof DURATION_MONTHS)[number];

/** Order lifecycle: created → verified/rejected (decided_at set). */
export const ORDER_STATUSES = ['pending', 'verified', 'rejected'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** The three receiving methods (ADR-0005); keys of the `wallets` setting. */
export const PAYMENT_METHODS = ['USDT-TRC20', 'USDT-BEP20', 'LTC'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type Coin = 'USDT' | 'LTC';
/** Blockchain network of the receiving wallet; LTC has only mainnet. */
export const NETWORKS = ['TRC20', 'BEP20', 'mainnet'] as const;
export type Network = (typeof NETWORKS)[number];

/** Admin actions recorded in the audit log (billing/02, billing/03). */
export const AUDIT_ACTIONS = [
  'order.verify',
  'order.reject',
  'entitlement.grant',
  'entitlement.revoke',
  'quota.comp',
  'user.password_reset',
  'user.delete',
  'settings.update',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** What an audit entry's action touched. */
export const AUDIT_TARGET_TYPES = ['order', 'user', 'settings'] as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

export type WalletAddresses = Record<PaymentMethod, string>;

export interface PlanPrice {
  /** USDT per month. */
  monthly: number;
  /** Total USDT per duration option — 12 months seeded at 10× monthly. */
  durations: Record<DurationMonths, number>;
}
export type PlanPrices = Record<Plan, PlanPrice>;

/** What a paid plan allows (PLAN.md §1 tiers table; billing/04 enforces). */
export interface PlanLimit {
  /** Hard page cap per Server Export. */
  pageCap: number;
  /** Monthly Server Export quota. */
  quotaMonthly: number;
}
export type PlanLimits = Record<Plan, PlanLimit>;

// ---------------------------------------------------------------------------
// Tables — spec §Data model. Timestamps are unix ms.
// ---------------------------------------------------------------------------

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type User = typeof users.$inferSelect;

export const sessions = sqliteTable('sessions', {
  token: text('token').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
});

/**
 * A user's submitted request to verify a Manual Payment (ADR-0005). Pending
 * until the Admin verifies or rejects it. Amounts are decimal strings, not
 * floats — they must round-trip exactly what was shown to the user and what
 * the Admin compares against on-chain.
 */
export const orders = sqliteTable('orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  referenceCode: text('reference_code').notNull().unique(),
  /**
   * Null after the account is deleted (billing/03): the Order stays as the
   * financial record — amounts, txid, decision — detached from the person.
   * The FK sets null rather than cascading so deleting a user anonymizes
   * their Orders instead of erasing them.
   */
  userId: integer('user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  plan: text('plan').notNull(), // Plan
  /** Chosen duration in months (DurationMonths). */
  duration: integer('duration').notNull(),
  coin: text('coin').notNull(), // Coin
  network: text('network').notNull(), // Network
  /** Null until the user submits their transaction details. */
  txid: text('txid'),
  amountExpected: text('amount_expected').notNull(),
  /** USDT per LTC captured when the Order was created; set only for LTC. */
  ltcRateUsdt: text('ltc_rate_usdt'),
  /** Amount the user claims to have sent, from their submission. */
  amountClaimed: text('amount_claimed'),
  status: text('status').notNull().default('pending'), // OrderStatus
  rejectReason: text('reject_reason'),
  note: text('note'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  /** Set when the Order leaves `pending`. */
  decidedAt: integer('decided_at', { mode: 'timestamp_ms' }),
});

export type Order = typeof orders.$inferSelect;

/** One row per user — the current Entitlement state; history lives in orders. */
export const entitlements = sqliteTable('entitlements', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  plan: text('plan').notNull(), // Plan
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Monthly Server Export usage keyed by period (`YYYY-MM`). */
export const exportUsage = sqliteTable(
  'export_usage',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    period: text('period').notNull(),
    count: integer('count').notNull().default(0),
    /** Admin-granted extra allowance for the period (billing/03 comp quota). */
    comps: integer('comps').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.period] })],
);

/** Export History — the only place user content rests server-side. */
export const exportsHistory = sqliteTable('exports_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  pages: integer('pages').notNull(),
  storedPath: text('stored_path').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  /** History retention (30 days) — purge target. */
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
});

/** Admin-editable app settings as JSON per key (wallets, prices). */
export const settingsKv = sqliteTable('settings_kv', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull().$type<unknown>(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Append-only record of every admin action (billing/02): Order verifications
 * and rejections now, settings changes when billing/03 adds them. The admin
 * identity is snapshotted (`admin_user_id` is deliberately a plain integer,
 * not a foreign key) so the trail survives the account it names — deleting a
 * user must not be able to erase the record of what was done to others.
 */
export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  adminUserId: integer('admin_user_id').notNull(),
  adminEmail: text('admin_email').notNull(),
  action: text('action').notNull(), // AuditAction
  targetType: text('target_type').notNull(), // AuditTargetType
  /** The Order id or settings key the action touched. */
  targetId: text('target_id').notNull(),
  /** JSON snapshots of the affected state before and after the action. */
  before: text('before', { mode: 'json' }).$type<unknown>(),
  after: text('after', { mode: 'json' }).$type<unknown>(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});
