// ─────────────────────────────────────────────────────────────────────────────
// Monthly Server Export quota (server/04).
//
// Usage lives in `export_usage` keyed by the UTC `YYYY-MM` period, so the
// monthly reset is lazy: a new period simply has no row until the first
// successful export (or comp) of that month — nothing sweeps old rows, and
// last month's counts can never leak into this month's decision.
//
// The allowance is the plan's `quotaMonthly` while the Entitlement is active,
// plus any comps the Admin granted for the period (billing/03). That math is
// computed here once so the export enforcement, GET /api/me, and the admin
// panel's usage view (billing/03) can't drift apart.
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq, sql } from 'drizzle-orm';
import type { AppDatabase } from './db/database.js';
import { exportUsage, type PlanLimits, type Plan } from './db/schema.js';

/** The usage period a timestamp falls in, UTC `YYYY-MM` (schema: export_usage). */
export function usagePeriod(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** An Entitlement expiring exactly now counts as expired. */
export function isEntitlementActive(
  entitlement: { expiresAt: Date } | null,
  now: Date,
): boolean {
  return (
    entitlement !== null && entitlement.expiresAt.getTime() > now.getTime()
  );
}

/** Everything the quota decision and the chip display need. */
export interface QuotaState {
  /** Successful Server Exports this period (comps not included). */
  used: number;
  /** Admin-granted extra allowance for the period (comp quota). */
  comps: number;
  /** The plan's monthly quota while the Entitlement is active, plus comps. */
  limit: number;
}

export function quotaState(
  db: AppDatabase,
  userId: number,
  entitlement: { plan: string; expiresAt: Date } | null,
  limits: PlanLimits,
  now: Date,
): QuotaState {
  const period = usagePeriod(now);
  const row = db
    .select({ count: exportUsage.count, comps: exportUsage.comps })
    .from(exportUsage)
    .where(and(eq(exportUsage.userId, userId), eq(exportUsage.period, period)))
    .get();
  const used = row?.count ?? 0;
  const comps = row?.comps ?? 0;
  const planQuota = isEntitlementActive(entitlement, now)
    ? (limits[entitlement!.plan as Plan]?.quotaMonthly ?? 0)
    : 0;
  return { used, comps, limit: planQuota + comps };
}

/**
 * Counts one successful Server Export against the user's current period.
 * Called by the worker when a render finishes — failed exports never reach
 * this, so usage increments only on success.
 */
export function incrementExportUsage(
  db: AppDatabase,
  userId: number,
  now: Date,
): void {
  const period = usagePeriod(now);
  db.insert(exportUsage)
    .values({ userId, period, count: 1 })
    .onConflictDoUpdate({
      target: [exportUsage.userId, exportUsage.period],
      set: { count: sql`${exportUsage.count} + 1` },
    })
    .run();
}
