// ─────────────────────────────────────────────────────────────────────────────
// The Payment Window (live-pricing/02).
//
// Six hours from creation within which an Order can be paid, fixed at creation.
// It is a bound on a quote, not a status: a window lapsing is not a decision
// anyone made, so the Order stays pending and no job sweeps it. Expired is
// derived here, the same way the codebase already derives an active Entitlement
// from its expiry rather than storing a flag and maintaining it.
//
// The deadline is nullable and null means no window. That is what exempts the
// Orders that predate the column — a backfill would instantly lapse every
// pending Order, including any with a payment in flight.
// ─────────────────────────────────────────────────────────────────────────────

/** How long an Order stays payable. Long enough for a crypto transfer, short
 *  enough that a frozen quote is not presented days later. */
export const PAYMENT_WINDOW_MS = 6 * 60 * 60 * 1000;

/**
 * Whether this Order's window has closed. Pending only, deadline present, and
 * past: a decided Order is not waiting for a payment, and a null deadline
 * never lapses.
 */
export function paymentWindowClosed(
  order: { status: string; paymentDeadline: Date | null },
  now: Date,
): boolean {
  return (
    order.status === 'pending' &&
    order.paymentDeadline !== null &&
    order.paymentDeadline.getTime() <= now.getTime()
  );
}

/** The deadline for an Order created now. */
export function paymentDeadlineFor(createdAt: Date): Date {
  return new Date(createdAt.getTime() + PAYMENT_WINDOW_MS);
}

/**
 * What the user is told when a submission is refused because the window closed.
 * It points at a new Order, and it does not blame the Rate: for a USDT Order
 * nothing moved, and sending someone after a problem that does not exist is
 * worse than saying less.
 */
export const PAYMENT_WINDOW_CLOSED_MESSAGE =
  'This order’s payment window has closed, so it can no longer be paid. Start a new order — the price will be the one shown today.';
