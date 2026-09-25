import { Link } from '../router';
import { planName, type PlanId } from '../pricing/plans';
import type { EntitlementState } from '../auth/account-store';
import type { Order } from '../billing/api';

/** Adds calendar months in UTC, clamping day-of-month overflow (Jan 31 + 1
 *  month → Feb 28) — the same arithmetic apps/server's admin/entitlement.ts
 *  owns; this module mirrors it for display. */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCMonth(result.getUTCMonth() + months);
  if (result.getUTCDate() !== day) {
    // The month overflowed into the next one (e.g. Feb 31 → Mar 2); day 0 is
    // the last day of the previous month.
    result.setUTCDate(0);
  }
  return result;
}

/**
 * The plan period the verified Orders granted, and when it ran out — the
 * expiry folded the way the server folds grants (apps/server's
 * admin/entitlement.ts): a duration stacks on the current expiry while it is
 * still active at the decision, otherwise it starts from the decision.
 * /api/me reports plan/expiresAt only while the Entitlement is active
 * (server/04) — after expiry both read null, and the lapse date lives in the
 * user's Order history (me.ts). Derived here, once, so the Account page can
 * name the ended plan without a second endpoint.
 */
export function lastPlanPeriod(
  orders: Order[],
): { plan: string; endedAt: Date } | null {
  // The Entitlement is granted when the Admin verifies the Order (ADR-0005),
  // so the grants fold in decision order, oldest first.
  const grants = orders
    .filter((order) => order.status === 'verified')
    .map((order) => ({
      plan: order.plan,
      decided: new Date(order.decidedAt ?? order.createdAt),
      months: order.durationMonths,
    }))
    .sort((a, b) => a.decided.getTime() - b.decided.getTime());
  if (grants.length === 0) return null;

  let expiry: Date | null = null;
  for (const grant of grants) {
    const base =
      expiry !== null && expiry.getTime() > grant.decided.getTime()
        ? expiry
        : grant.decided;
    expiry = addMonths(base, grant.months);
  }
  // The final entitlement carries the newest verified Order's plan.
  return { plan: grants[grants.length - 1]!.plan, endedAt: expiry! };
}

interface PlanSummaryProps {
  entitlement: EntitlementState | null;
  /** Usage vs allowance (plan quota + comps), from the account store. */
  quota: { used: number; limit: number } | null;
  /** The user's Orders — the ended plan's source once the Entitlement is gone. */
  orders: Order[] | null;
  /** The Orders request's failure, so Free-ness doesn't wait on the list. */
  ordersError: string | null;
}

/**
 * The Account page's plan and Quota summary: the current plan with its Plan
 * Expiry, an explicit expired state derived from the Order history once the
 * Entitlement is gone, the Server Export quota used vs limit (comps are
 * already folded into the limit the server reports), and the upgrade CTA
 * whenever no Entitlement is active — /pricing is where the upgrade flow
 * starts. Free-ness never waits on the Orders request: without an active
 * Entitlement the row shows a loading line while the list is in flight and
 * Free as soon as it lands — or fails — because /api/me already settled the
 * plan; only the ended plan's name and date need the Order history.
 */
export function PlanSummary({
  entitlement,
  quota,
  orders,
  ordersError,
}: PlanSummaryProps) {
  const last = entitlement ? null : orders ? lastPlanPeriod(orders) : null;
  const ended = last !== null && last.endedAt.getTime() <= Date.now();

  return (
    <section
      aria-labelledby="account-plan-heading"
      className="rounded-pane border border-hairline bg-surface p-4 sm:p-5"
    >
      <h2
        id="account-plan-heading"
        className="text-base font-semibold tracking-tight text-ink"
      >
        Plan
      </h2>

      {entitlement && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-ink">
            {planName(entitlement.plan as PlanId)}
          </p>
          <p className="mt-0.5 text-xs text-ink-soft tabular-nums">
            Expires {entitlement.expiresAt.slice(0, 10)}
          </p>
        </div>
      )}

      {!entitlement && last && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold text-ink">
              {planName(last.plan as PlanId)}
            </p>
            {ended && (
              <span
                data-testid="plan-expired"
                className="shrink-0 rounded-control border border-hairline bg-canvas px-2 py-0.5 text-xs font-medium text-ink-soft"
              >
                Expired
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-ink-soft tabular-nums">
            {ended
              ? `Ended ${last.endedAt.toISOString().slice(0, 10)} — nothing auto-renews.`
              : 'No longer active — nothing auto-renews.'}
          </p>
        </div>
      )}

      {!entitlement && !last && orders === null && ordersError === null && (
        <p className="mt-3 text-xs text-ink-faint">Loading your plan…</p>
      )}

      {!entitlement && !last && (orders !== null || ordersError !== null) && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-ink">Free</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            No paid plan — upgrades start from the plans.
          </p>
        </div>
      )}

      {quota && (entitlement || quota.limit > 0) && (
        <div className="mt-4">
          <p className="text-xs font-medium text-ink-soft">
            Server Export quota
          </p>
          <p
            data-testid="account-quota"
            className="mt-0.5 font-mono text-xs text-ink tabular-nums"
          >
            {quota.used} of {quota.limit} used this period
          </p>
        </div>
      )}

      {!entitlement && (
        <div className="mt-4">
          <Link
            to="/pricing"
            className="touch-target inline-flex h-8 items-center rounded-control border border-hairline bg-canvas px-3 text-xs font-medium text-ink outline-offset-2 outline-accent transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-2"
          >
            View plans
          </Link>
        </div>
      )}
    </section>
  );
}
