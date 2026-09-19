import { useState } from 'react';
import { Link } from '../router';
import type { Order } from '../billing/api';
import { orderDate, STATUS_BADGE, STATUS_LABEL } from '../billing/payment';
import { PaymentForm } from '../billing/PaymentForm';
import { PaymentInstructions } from '../billing/PaymentInstructions';

interface OrdersSectionProps {
  orders: Order[] | null;
  error: string | null;
  /** Refetches — the Retry action, and after a resubmission amends an Order. */
  onRefresh: () => void;
}

/**
 * The Account page's Orders (moved out of the Upgrade status dialog): compact
 * rows — Reference Code, created date, plan and duration, amount, status
 * badge — that expand in place to the payment details and, for a rejected
 * Order, its reject reason. One pending strip renders above the list while an
 * Order awaits verification, so the state is said once, list-wide, and no
 * duplicate Order goes out.
 */
export function OrdersSection({
  orders,
  error,
  onRefresh,
}: OrdersSectionProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // The strip's two states: details submitted (the ball is in the Admin's
  // court), or an Order still waiting for the user's payment details.
  const anySubmitted = orders?.some(
    (order) => order.status === 'pending' && order.txid !== null,
  );
  const anyPending = orders?.some((order) => order.status === 'pending');

  return (
    <section
      aria-labelledby="account-orders-heading"
      className="rounded-pane border border-hairline bg-surface p-4 sm:p-5"
    >
      <h2
        id="account-orders-heading"
        className="text-base font-semibold tracking-tight text-ink"
      >
        Orders
      </h2>

      {error && (
        <div className="mt-3">
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
          <button
            type="button"
            onClick={onRefresh}
            className="touch-target mt-2 h-8 rounded-control border border-hairline px-3 text-xs text-ink-soft outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
          >
            Retry
          </button>
        </div>
      )}

      {!error && orders === null && (
        <p className="mt-3 py-4 text-center text-xs text-ink-faint">
          Loading your orders…
        </p>
      )}

      {orders !== null && orders.length === 0 && !error && (
        <div className="mt-3 py-4 text-center">
          <p className="text-sm text-ink">No orders yet.</p>
          <p className="mx-auto mt-1 max-w-prose text-xs text-ink-soft">
            Upgrades start from the plans — pick one and you'll find the order
            and its payment instructions here.
          </p>
          <Link
            to="/pricing"
            className="touch-target mt-3 inline-flex h-8 items-center rounded-control border border-hairline bg-canvas px-3 text-xs font-medium text-ink outline-offset-2 outline-accent transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-2"
          >
            View plans
          </Link>
        </div>
      )}

      {orders !== null && orders.length > 0 && !error && (
        <>
          {anyPending && (
            <p
              role="status"
              data-testid="orders-pending-strip"
              className="mt-3 rounded-control border border-hairline bg-canvas px-3 py-2 text-xs text-ink"
            >
              {anySubmitted
                ? 'Payment details submitted — awaiting verification. You don’t need to submit another Order.'
                : 'An Order here is awaiting your payment details — send the payment and enter them from the Order below.'}
            </p>
          )}
          <ul className="mt-3 space-y-2" data-testid="order-list">
            {orders.map((order) => {
              const expandedNow = order.id === expandedId;
              return (
                <li
                  key={order.id}
                  data-testid="order-row"
                  className="rounded-pane border border-hairline bg-canvas p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold text-ink">
                        {order.referenceCode}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-soft tabular-nums">
                        {order.plan} · {order.durationMonths}{' '}
                        {order.durationMonths === 1 ? 'month' : 'months'}
                        {' · '}
                        {order.amountExpected} {order.coin}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-faint">
                        Created {orderDate(order.createdAt)}
                        {order.decidedAt &&
                          ` · Decided ${orderDate(order.decidedAt)}`}
                      </p>
                    </div>
                    <span
                      data-testid="order-status"
                      className={`shrink-0 rounded-control border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[order.status]}`}
                    >
                      {STATUS_LABEL[order.status]}
                    </span>
                  </div>

                  {order.status !== 'verified' && !expandedNow && (
                    <button
                      type="button"
                      onClick={() => setExpandedId(order.id)}
                      className="touch-target mt-2 h-7 rounded-control border border-hairline px-2.5 text-xs text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
                    >
                      {order.status === 'rejected'
                        ? 'Resubmit payment'
                        : order.txid
                          ? 'Edit details'
                          : 'Enter payment details'}
                    </button>
                  )}

                  {expandedNow && (
                    <div className="mt-3 border-t border-hairline pt-3">
                      {order.status === 'rejected' && order.rejectReason && (
                        <p
                          data-testid="order-reject-reason"
                          className="text-xs text-danger"
                        >
                          Reason: {order.rejectReason}
                        </p>
                      )}
                      <div
                        className={
                          order.status === 'rejected' && order.rejectReason
                            ? 'mt-3'
                            : undefined
                        }
                      >
                        <PaymentInstructions order={order} />
                      </div>
                      <div className="mt-3">
                        <PaymentForm
                          order={order}
                          onSubmitted={() => {
                            setExpandedId(null);
                            onRefresh();
                          }}
                          onCancel={() => setExpandedId(null)}
                        />
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
