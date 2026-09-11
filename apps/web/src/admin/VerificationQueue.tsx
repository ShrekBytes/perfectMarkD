import { useCallback, useEffect, useState } from 'react';
import { listAdminOrders, type AdminOrder, type OrderStatus } from './api';
import { amountsMatch, explorerUrl } from './verification-display';
import {
  NETWORK_LABELS,
  orderDate,
  STATUS_BADGE,
  STATUS_LABEL,
} from '../billing/payment';
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
 * The Verification queue (billing/02): every Order with the details the
 * Admin decides on — who, how much was claimed against what was expected,
 * and the txid as an on-chain deep link — plus the Verify and Reject
 * actions for pending Orders. Defaults to the pending queue; decided
 * Orders are one filter click away.
 */
export function VerificationQueue() {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [filter, setFilter] = useState<QueueFilter>('pending');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<AdminOrder | null>(null);
  const [rejecting, setRejecting] = useState<AdminOrder | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setOrders(await listAdminOrders());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const counts = new Map<QueueFilter, number>();
  for (const order of orders ?? []) {
    counts.set(order.status, (counts.get(order.status) ?? 0) + 1);
  }
  const visible = (orders ?? []).filter(
    (order) => filter === 'all' || order.status === filter,
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
                  ? 'border-accent bg-accent text-accent-ink'
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
            const usdt = usdtEquivalent(order);
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
                      {order.userEmail}
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
                  Created {orderDate(order.createdAt)}
                  {order.decidedAt &&
                    ` · Decided ${orderDate(order.decidedAt)}`}
                </p>

                {order.status === 'pending' && (
                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      data-testid="verify-button"
                      onClick={() => setVerifying(order)}
                      className="h-8 rounded-control bg-accent px-3 text-xs font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-strong focus-visible:outline-2"
                    >
                      Verify
                    </button>
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
