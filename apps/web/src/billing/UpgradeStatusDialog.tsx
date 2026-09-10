import { useCallback, useEffect, useState } from 'react';
import { navigate } from '../router';
import { Dialog } from '../shell/Dialog';
import { listOrders, type Order, type OrderStatus } from './api';
import { PaymentForm } from './PaymentForm';
import { PaymentInstructions } from './PaymentInstructions';

interface UpgradeStatusDialogProps {
  onClose: () => void;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending',
  verified: 'Verified',
  rejected: 'Rejected',
};

const STATUS_BADGE: Record<OrderStatus, string> = {
  pending: 'border-hairline bg-canvas text-ink-soft',
  verified: 'border-accent/40 bg-accent-soft text-accent',
  rejected: 'border-danger/30 bg-danger/10 text-danger',
};

function orderDate(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * The user's Orders (billing/01): where "Upgrade status" lands. Shows each
 * Order's Reference Code, plan, amount, and status — with reject reasons and
 * a way to resubmit, since a submission amends the same Order rather than
 * creating a new one.
 */
export function UpgradeStatusDialog({ onClose }: UpgradeStatusDialogProps) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setOrders(await listOrders());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Dialog
      label="Upgrade status"
      testId="upgrade-status-dialog"
      backdropTestId="upgrade-status-backdrop"
      panelClassName="flex max-h-[85vh] w-full max-w-lg flex-col"
      contentClassName="min-h-0 flex-1 overflow-y-auto"
      onClose={onClose}
    >
      {error && (
        <div className="text-sm">
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-2 h-8 rounded-control border border-hairline px-3 text-xs text-ink-soft outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
          >
            Retry
          </button>
        </div>
      )}

      {!error && orders === null && (
        <p className="py-6 text-center text-xs text-ink-faint">
          Loading your orders…
        </p>
      )}

      {orders !== null && orders.length === 0 && !error && (
        <div className="py-6 text-center">
          <p className="text-sm text-ink">No orders yet.</p>
          <p className="mx-auto mt-1 max-w-prose text-xs text-ink-soft">
            Upgrades start from the plans — pick one and you'll find the order
            and its payment instructions here.
          </p>
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate('/pricing');
            }}
            className="mt-3 h-8 rounded-control border border-accent/40 bg-accent-soft px-3 text-xs font-medium text-accent outline-offset-2 outline-accent hover:bg-accent hover:text-accent-ink focus-visible:outline-2"
          >
            View plans
          </button>
        </div>
      )}

      {orders !== null && orders.length > 0 && (
        <ul className="space-y-2" data-testid="order-list">
          {orders.map((order) => {
            const expandedNow = order.id === expandedId;
            const awaitingPayment = order.status === 'pending' && !order.txid;
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
                    <p className="mt-0.5 text-xs text-ink-soft">
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

                {order.status === 'pending' && (
                  <p className="mt-1.5 text-xs text-ink-faint">
                    {awaitingPayment
                      ? 'Awaiting your payment details.'
                      : 'Payment details submitted — awaiting verification.'}
                  </p>
                )}
                {order.status === 'rejected' && order.rejectReason && (
                  <p
                    data-testid="order-reject-reason"
                    className="mt-1.5 text-xs text-danger"
                  >
                    Reason: {order.rejectReason}
                  </p>
                )}

                {order.status !== 'verified' && !expandedNow && (
                  <button
                    type="button"
                    onClick={() => setExpandedId(order.id)}
                    className="mt-2 h-7 rounded-control border border-hairline px-2.5 text-xs text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
                  >
                    {order.status === 'rejected'
                      ? 'Resubmit payment'
                      : awaitingPayment
                        ? 'Enter payment details'
                        : 'Edit details'}
                  </button>
                )}

                {expandedNow && (
                  <div className="mt-3 border-t border-hairline pt-3">
                    <PaymentInstructions order={order} />
                    <div className="mt-3">
                      <PaymentForm
                        order={order}
                        onSubmitted={() => {
                          setExpandedId(null);
                          void refresh();
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
      )}
    </Dialog>
  );
}
