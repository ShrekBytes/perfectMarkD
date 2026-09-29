import { useCallback, useEffect, useState } from 'react';
import { errorToMessage } from '../api/client';
import {
  getAdminSettings,
  listAdminOrders,
  type AdminOrder,
  type OrderStatus,
} from './api';
import { amountsMatch, explorerUrl } from './verification-display';
import {
  NETWORK_LABELS,
  orderDateTime,
  STATUS_BADGE,
  STATUS_LABEL,
} from '../billing/payment';
import { formatDate } from '../documents/text';
import { VerifyDialog } from './VerifyDialog';
import { RejectDialog } from './RejectDialog';

type QueueFilter = OrderStatus | 'all';

const FILTERS: Array<{ id: QueueFilter; label: string }> = [
  { id: 'pending', label: 'Pending' },
  { id: 'verified', label: 'Verified' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
];

/** ≈USDT for LTC orders, from the rate captured when the Order was created. */
function usdtEquivalent(order: AdminOrder): string | null {
  if (order.coin !== 'LTC' || order.ltcRateUsdt === null) return null;
  const total = Number(order.amountExpected) * Number(order.ltcRateUsdt);
  if (!Number.isFinite(total)) return null;
  return `≈ ${total.toFixed(2)} USDT`;
}

/**
 * Whether a short LTC payment is probably the Rate having moved, rather than
 * the user miscalculating. Two conditions, both from the Order itself: the
 * claimed amount is short (an overpayment is a different conversation), and the
 * rate captured at creation now differs from the rate a new Order would be
 * quoted at. When it holds, the queue says so, because "the user got the
 * arithmetic wrong" is the wrong conclusion to hand someone deciding whether
 * to grant a paid entitlement (live-pricing/02).
 */
function rateMovedContext(
  order: AdminOrder,
  currentRateUsdt: number | null,
): string | null {
  if (order.coin !== 'LTC' || order.ltcRateUsdt === null) return null;
  if (order.amountClaimed === null) return null;
  if (Number(order.amountClaimed) >= Number(order.amountExpected)) return null;
  const captured = Number(order.ltcRateUsdt);
  if (currentRateUsdt === null || !Number.isFinite(captured)) return null;
  if (Math.abs(currentRateUsdt - captured) / captured < 0.001) return null;
  const atCurrentRate = Number(order.amountExpected) * currentRateUsdt;
  if (!Number.isFinite(atCurrentRate)) return null;
  return `The Rate has moved since this order was created — it is now ${currentRateUsdt} USDT per LTC, and at that rate the amount would have been ${atCurrentRate.toFixed(8)} USDT. A short payment here often means the rate changed, not that the amount was calculated wrong.`;
}

/**
 * The Verification queue (billing/02): every Order with the details the
 * Admin decides on — who, how much was claimed against what was expected,
 * and the txid as an on-chain deep link — plus the Verify and Reject
 * actions for pending Orders. Defaults to the pending queue; decided
 * Orders are one filter click away.
 *
 * A lapsed Payment Window (live-pricing/02) is shown rather than hidden: the
 * queue is also the financial record, and dropping the row would leave an
 * operator wondering where an Order went. It leaves the pending filter and
 * loses the Verify affordance, because an Order that can no longer be paid has
 * nothing to verify and granting against it means granting on a quote the
 * customer had no chance to meet.
 */
export function VerificationQueue() {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  // Read beside the Orders so the queue can say "the Rate has moved" without
  // becoming a second settings surface: it carries nothing about an order or a
  // user, it rides the settings read the panel already makes, and it fails
  // harmlessly — without it the queue simply does not offer the explanation.
  const [currentRate, setCurrentRate] = useState<number | null>(null);
  const [filter, setFilter] = useState<QueueFilter>('pending');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<AdminOrder | null>(null);
  const [rejecting, setRejecting] = useState<AdminOrder | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setOrders(await listAdminOrders());
    } catch (cause) {
      setError(errorToMessage(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let live = true;
    void getAdminSettings()
      .then((settings) => {
        if (live) setCurrentRate(settings.ltcRate.usdtPerLtc);
      })
      .catch(() => {
        // The context is a nicety on a short payment. If the settings read
        // cannot be made, the queue simply does not offer the explanation.
        if (live) setCurrentRate(null);
      });
    return () => {
      live = false;
    };
  }, []);

  const counts = new Map<QueueFilter, number>();
  for (const order of orders ?? []) {
    counts.set(order.status, (counts.get(order.status) ?? 0) + 1);
  }
  // A lapsed Order leaves the pending view: the pending queue is a work list,
  // and a row nobody can act on is not work. It remains under All and in the
  // counts — the queue is also the financial record, and a vanished row would
  // leave an operator wondering where an Order went.
  const visible = (orders ?? []).filter(
    (order) =>
      filter === 'all' || (order.status === filter && !order.paymentExpired),
  );

  return (
    <div>
      {error && (
        <div className="text-sm">
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
          <button
            type="button"
            data-testid="queue-retry"
            onClick={() => void refresh()}
            className="mt-2 h-8 rounded-control border border-hairline px-3 text-xs text-ink-soft outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
          >
            Retry
          </button>
        </div>
      )}

      {!error && (
        <div
          role="group"
          aria-label="Filter orders by status"
          className="flex flex-wrap gap-1.5"
        >
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              data-testid={`filter-${id}`}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={`h-8 rounded-control border px-3 text-xs font-medium transition-colors duration-150 outline-offset-2 outline-accent focus-visible:outline-2 ${
                filter === id
                  ? 'border-ink bg-ink text-accent-ink'
                  : 'border-hairline bg-canvas text-ink-soft hover:bg-surface-hover hover:text-ink'
              }`}
            >
              {label}
              {orders !== null && (counts.get(id) ?? 0) > 0 && (
                <span className="ml-1 text-ink-faint">
                  {counts.get(id) ?? 0}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {!error && orders === null && (
        <p className="py-6 text-center text-xs text-ink-faint">
          Loading orders…
        </p>
      )}

      {!error && orders !== null && visible.length === 0 && (
        <p
          data-testid="queue-empty"
          className="py-6 text-center text-xs text-ink-soft"
        >
          {filter === 'pending'
            ? 'No pending orders — nothing waiting for verification.'
            : `No ${filter} orders.`}
        </p>
      )}

      {!error && visible.length > 0 && (
        <ul className="mt-3 space-y-2" data-testid="admin-order-list">
          {visible.map((order) => {
            const match =
              order.amountClaimed !== null &&
              amountsMatch(order.amountExpected, order.amountClaimed);
            const mismatch = order.amountClaimed !== null && !match;
            const rateContext = rateMovedContext(order, currentRate);
            const usdt = usdtEquivalent(order);
            // A lapsed Order can no longer be paid, so there is nothing to
            // verify: the customer's window closed whether or not they had
            // submitted. Verify is withheld on every one of them, and Reject
            // stays so the user is told to start a new Order.
            const lapsed = order.paymentExpired;
            return (
              <li
                key={order.id}
                data-testid="admin-order-row"
                className="rounded-pane border border-hairline bg-surface p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-ink">
                      {order.referenceCode}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-ink-soft">
                      {order.userEmail ?? '(deleted account)'}
                    </p>
                  </div>
                  <span
                    data-testid="order-status"
                    className={`shrink-0 rounded-control border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[order.status]}`}
                  >
                    {STATUS_LABEL[order.status]}
                  </span>
                </div>

                <p className="mt-2 text-xs text-ink">
                  {order.plan} · {order.durationMonths}{' '}
                  {order.durationMonths === 1 ? 'month' : 'months'} ·{' '}
                  {order.amountExpected} {order.coin}
                  {usdt && (
                    <span
                      data-testid="usdt-equivalent"
                      className="text-ink-soft"
                    >
                      {' '}
                      {usdt}
                    </span>
                  )}
                  {' · '}
                  {NETWORK_LABELS[order.network as keyof typeof NETWORK_LABELS]}
                </p>

                <p className="mt-1 text-xs">
                  {order.amountClaimed === null ? (
                    <span className="text-ink-faint">Nothing claimed yet.</span>
                  ) : match ? (
                    <span className="text-ink-soft">
                      Claimed {order.amountClaimed} · expected{' '}
                      {order.amountExpected} {order.coin}
                    </span>
                  ) : (
                    <span
                      data-testid="amount-mismatch"
                      className="font-medium text-danger"
                    >
                      Claimed {order.amountClaimed} · expected{' '}
                      {order.amountExpected} {order.coin}
                    </span>
                  )}
                </p>

                <p className="mt-1 text-xs text-ink-soft">
                  {order.txid ? (
                    <a
                      data-testid="txid-link"
                      href={explorerUrl(order.network, order.txid)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono underline decoration-hairline underline-offset-2 outline-offset-2 outline-accent hover:text-ink"
                    >
                      {order.txid.slice(0, 10)}…{order.txid.slice(-6)}
                    </a>
                  ) : (
                    <span className="text-ink-faint">No txid submitted.</span>
                  )}
                  {order.note && (
                    <span className="text-ink-faint"> — “{order.note}”</span>
                  )}
                </p>

                {order.status === 'rejected' && order.rejectReason && (
                  <p
                    data-testid="order-reject-reason"
                    className="mt-1.5 text-xs text-danger"
                  >
                    Reason: {order.rejectReason}
                  </p>
                )}

                <p className="mt-1.5 text-xs text-ink-faint">
                  Created {formatDate(order.createdAt)}
                  {order.decidedAt &&
                    ` · Decided ${formatDate(order.decidedAt)}`}
                  {order.paymentDeadline !== null &&
                    ` · ${
                      order.paymentExpired
                        ? `window lapsed ${formatDate(order.paymentDeadline)}`
                        : `payable until ${orderDateTime(order.paymentDeadline)}`
                    }`}
                </p>

                {lapsed && (
                  <p
                    data-testid="order-window-lapsed"
                    className="mt-1.5 text-xs text-ink-soft"
                  >
                    The payment window closed, so this Order can no longer be
                    paid and cannot be verified. Reject it with a reason so the
                    user knows to start a new one.
                  </p>
                )}

                {mismatch && rateContext && (
                  <p
                    data-testid="rate-moved-context"
                    className="mt-1.5 text-xs text-ink-soft"
                  >
                    {rateContext}
                  </p>
                )}

                {order.status === 'pending' && (
                  <div className="mt-2.5 flex gap-2">
                    {/* Verify is withheld on a lapsed Order; Reject always
                        stays, because the user is owed a reason and a closed
                        window is a perfectly good one. */}
                    {!lapsed && (
                      <button
                        type="button"
                        data-testid="verify-button"
                        onClick={() => setVerifying(order)}
                        className="h-8 rounded-control bg-accent-strong px-3 text-xs font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2"
                      >
                        Verify
                      </button>
                    )}
                    <button
                      type="button"
                      data-testid="reject-button"
                      onClick={() => setRejecting(order)}
                      className="h-8 rounded-control border border-danger/30 px-3 text-xs font-medium text-danger transition-colors duration-150 outline-offset-2 outline-accent hover:bg-danger/10 focus-visible:outline-2"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {verifying && (
        <VerifyDialog
          order={verifying}
          onVerified={() => {
            setVerifying(null);
            void refresh();
          }}
          onClose={() => setVerifying(null)}
        />
      )}
      {rejecting && (
        <RejectDialog
          order={rejecting}
          // The dialog offers the rate-move reason only when the queue has
          // established it, so the customer is never told the rate moved on the
          // strength of an Admin's guess.
          rateMoved={
            rateMovedContext(rejecting, currentRate) !== null &&
            !rejecting.paymentExpired
          }
          onRejected={() => {
            setRejecting(null);
            void refresh();
          }}
          onClose={() => setRejecting(null)}
        />
      )}
    </div>
  );
}
