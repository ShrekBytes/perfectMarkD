import { useState } from 'react';
import { Link } from '../router';
import type { Order } from '../billing/api';
import { orderDateTime, STATUS_BADGE, STATUS_LABEL } from '../billing/payment';
import { formatDate } from '../documents/text';
import { PaymentForm } from '../billing/PaymentForm';
import { PaymentInstructions } from '../billing/PaymentInstructions';
import { AccountSection } from './AccountSection';

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
  // court), or an Order still waiting for the user's payment details. A
  // lapsed Order counts for neither: there is nothing left to submit and
  // nothing left to wait for, and including it would leave the strip
  // promising a payment window that has already closed.
  const payable = orders?.filter(
    (order) => order.status === 'pending' && !order.paymentExpired,
  );
  const anySubmitted = payable?.some((order) => order.txid !== null);
  const anyPending = payable !== undefined && payable.length > 0;
  const anyLapsed = orders?.some((order) => order.paymentExpired) ?? false;

  return (
    <AccountSection headingId="account-orders-heading" heading="Orders">
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
          {anyLapsed && (
            <p
              role="status"
              data-testid="orders-lapsed-strip"
              className="mt-3 rounded-control border border-hairline bg-canvas px-3 py-2 text-xs text-ink-soft"
            >
              An Order here is past its payment window and can no longer be
              paid. It is not cancelled — start a new Order and the price will
              be the one shown today.
            </p>
          )}
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
              // A lapsed window is not a fourth status, so the badge still
              // says Pending. What changes is that there is nothing to pay and
              // a new Order is the way out — saying that here beats letting
              // someone send funds against a quote that closed hours ago.
              const lapsed = order.paymentExpired;
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
                      <p className="mt-0.5 font-mono text-xs text-ink-soft tabular-nums">
                        {order.plan} · {order.durationMonths}{' '}
                        {order.durationMonths === 1 ? 'month' : 'months'}
                        {' · '}
                        {order.amountExpected} {order.coin}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-faint">
                        Created {formatDate(order.createdAt)}
                        {order.decidedAt &&
                          ` · Decided ${formatDate(order.decidedAt)}`}
                      </p>
                    </div>
                    <span
                      data-testid="order-status"
                      className={`shrink-0 rounded-control border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[order.status]}`}
                    >
                      {STATUS_LABEL[order.status]}
                    </span>
                  </div>

                  {lapsed && (
                    <p
                      role="status"
                      data-testid="order-window-lapsed"
                      className="mt-2 rounded-control border border-hairline bg-canvas px-2.5 py-2 text-xs text-ink-soft"
                    >
                      The payment window closed
                      {order.paymentDeadline
                        ? ` ${orderDateTime(order.paymentDeadline)}`
                        : ''}
                      , so this Order can no longer be paid. It is not cancelled
                      — the button below starts a new one.
                    </p>
                  )}

                  {!lapsed && order.status !== 'verified' && !expandedNow && (
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

                  {lapsed && !expandedNow && (
                    <Link
                      to="/pricing"
                      data-testid="order-new-order"
                      className="touch-target mt-2 inline-flex h-7 items-center rounded-control bg-accent-strong px-2.5 text-xs font-medium text-accent-ink shadow-sm transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2"
                    >
                      Start a new order
                    </Link>
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
                      {/* A lapsed Order shows the form's absence, never the
                          form: submitting into a closed window is refused by
                          the server, and an offered control that always fails
                          is worse than none. */}
                      {lapsed ? (
                        <Link
                          to="/pricing"
                          data-testid="order-new-order-expanded"
                          className="touch-target mt-3 inline-flex h-9 items-center rounded-control bg-accent-strong px-3 text-sm font-medium text-accent-ink shadow-sm transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2"
                        >
                          Start a new order
                        </Link>
                      ) : (
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
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </AccountSection>
  );
}
