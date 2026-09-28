import { useState } from 'react';
import { Dialog } from '../shell/Dialog';
import { rejectOrder, type AdminOrder } from './api';

interface RejectDialogProps {
  order: AdminOrder;
  /** Called after the rejection landed; the queue refreshes and closes. */
  onRejected: () => void;
  onClose: () => void;
}

/**
 * A reason the Admin can apply in one click instead of typing. Offered, never
 * required — the field stays free text because a reason the user can act on
 * has to say what to correct, and only the Admin knows. Each one is a complete
 * sentence, because this text is read by the customer on their Account page
 * (live-pricing/02: a short LTC payment now often means the Rate moved, and
 * "wrong amount" would send them after the wrong problem).
 */
function suggestedReasons(order: AdminOrder): string[] {
  if (order.paymentExpired) {
    return [
      'This order’s payment window closed before the payment arrived, so it can no longer be accepted. Please start a new order — the price will be the one shown today.',
    ];
  }
  const short =
    order.amountClaimed !== null &&
    Number(order.amountClaimed) < Number(order.amountExpected);
  if (short && order.coin === 'LTC') {
    return [
      `The amount received is short of the order. The LTC rate moved after this order was created, so the amount asked for is no longer the current one — please start a new order to be charged the current rate.`,
      `The amount received is short of the order. Please start a new order and send the amount shown for it.`,
    ];
  }
  if (short) {
    return [
      `The amount received is less than the order asked for. Please start a new order and send the exact amount shown for it.`,
    ];
  }
  return [];
}

/**
 * The Reject decision (billing/02). The reason is the point of rejecting —
 * it is what the user reads on their Account page and what they
 * correct on resubmission, so the dialog refuses to send without one.
 */
export function RejectDialog({
  order,
  onRejected,
  onClose,
}: RejectDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const suggestions = suggestedReasons(order);

  const onReject = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await rejectOrder(order.id, reason.trim());
      onRejected();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
      );
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      label="Reject order"
      testId="reject-dialog"
      backdropTestId="reject-backdrop"
      panelClassName="w-full max-w-md"
      onClose={onClose}
    >
      <p className="text-xs text-ink-soft">
        <span className="font-mono text-sm font-semibold text-ink">
          {order.referenceCode}
        </span>{' '}
        — {order.userEmail}
      </p>
      <p className="mt-1 text-xs text-ink-soft">
        The reason is shown to the user, who can resubmit corrected details.
        {order.paymentExpired &&
          ' This order’s payment window has closed, so it cannot be paid or verified — a rejection tells the user to start a new one.'}
      </p>

      {suggestions.length > 0 && (
        <div data-testid="reject-suggestions" className="mt-3">
          <p className="text-xs font-medium text-ink-soft">
            Common reasons for this order
          </p>
          <div className="mt-1.5 space-y-1.5">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                data-testid="reject-suggestion"
                onClick={() => setReason(suggestion)}
                className="block w-full rounded-control border border-hairline bg-canvas px-2.5 py-2 text-left text-xs text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="mt-3 block text-xs font-medium text-ink-soft">
        Reason
        <textarea
          data-testid="reject-reason"
          rows={3}
          maxLength={1000}
          autoFocus
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. Amount received does not match the order — sent 3 USDT instead of 9."
          className="mt-1 block w-full rounded-control border border-hairline bg-canvas px-2.5 py-2 text-sm text-ink outline-offset-2 outline-accent focus-visible:outline-2"
        />
      </label>

      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          data-testid="confirm-reject"
          disabled={reason.trim() === '' || submitting}
          onClick={() => void onReject()}
          className="h-9 flex-1 rounded-control bg-danger text-sm font-medium text-white transition-colors duration-150 outline-offset-2 outline-accent focus-visible:outline-2 disabled:opacity-60"
        >
          {submitting ? 'Rejecting…' : 'Reject order'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-control border border-hairline px-3 text-sm text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
        >
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
