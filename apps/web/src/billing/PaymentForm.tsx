import { useState, type FormEvent } from 'react';
import { submitOrderPayment, type Network, type Order } from './api';
import { isValidTxid, NETWORK_LABELS, networksForCoin } from './payment';

interface PaymentFormProps {
  order: Order;
  /** Called with the amended order once the server accepted the details. */
  onSubmitted: (order: Order) => void;
  onCancel?: () => void;
}

/**
 * The "I've sent the payment" form (billing/01): network, txid, amount, and
 * an optional note. Also the resubmission form — submitting amends the same
 * Order, so a rejected (or pending) order's previous details are prefilled
 * and the user corrects them rather than retyping everything blind. Network
 * choices are limited to what can actually carry the order's coin.
 */
export function PaymentForm({
  order,
  onSubmitted,
  onCancel,
}: PaymentFormProps) {
  const allowedNetworks = networksForCoin(order.coin);
  const [network, setNetwork] = useState<Network>(order.network);
  const [txid, setTxid] = useState(order.txid ?? '');
  const [amount, setAmount] = useState(
    order.amountClaimed ?? order.amountExpected,
  );
  const [note, setNote] = useState(order.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!isValidTxid(txid)) {
      setError(
        'Enter the transaction ID — the 64-character hexadecimal string your wallet or explorer shows.',
      );
      return;
    }
    const claimed = Number(amount);
    if (amount.trim() === '' || !Number.isFinite(claimed) || claimed <= 0) {
      setError('Enter the amount you sent, greater than 0.');
      return;
    }

    setSubmitting(true);
    try {
      const updated = await submitOrderPayment(order.id, {
        network,
        txid: txid.trim(),
        amount: claimed,
        note: note.trim() === '' ? undefined : note.trim(),
      });
      onSubmitted(updated);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
      );
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      data-testid="payment-form"
      className="w-full"
    >
      <label className="block text-xs font-medium text-ink-soft">
        Network you sent on
        <select
          name="network"
          value={network}
          onChange={(event) => setNetwork(event.target.value as Network)}
          className="mt-1 block h-9 w-full rounded-control border border-hairline bg-canvas px-2 text-sm text-ink outline-offset-2 outline-accent focus-visible:outline-2"
        >
          {allowedNetworks.map((value) => (
            <option key={value} value={value}>
              {NETWORK_LABELS[value]}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-3 block text-xs font-medium text-ink-soft">
        Transaction ID (txid)
        <input
          type="text"
          name="txid"
          required
          spellCheck={false}
          autoComplete="off"
          placeholder="64-character hexadecimal string"
          value={txid}
          onChange={(event) => setTxid(event.target.value)}
          className="mt-1 block h-9 w-full rounded-control border border-hairline bg-canvas px-2.5 font-mono text-sm text-ink outline-offset-2 outline-accent focus-visible:outline-2"
        />
      </label>

      <div className="mt-3 flex gap-3">
        <label className="block flex-1 text-xs font-medium text-ink-soft">
          Amount sent ({order.coin})
          <input
            type="number"
            name="amount"
            required
            min="0"
            step="any"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="mt-1 block h-9 w-full rounded-control border border-hairline bg-canvas px-2.5 font-mono text-sm text-ink outline-offset-2 outline-accent focus-visible:outline-2"
          />
        </label>

        <label className="block flex-1 text-xs font-medium text-ink-soft">
          Note (optional)
          <input
            type="text"
            name="note"
            maxLength={1000}
            placeholder="e.g. sent from an exchange"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mt-1 block h-9 w-full rounded-control border border-hairline bg-canvas px-2.5 text-sm text-ink outline-offset-2 outline-accent focus-visible:outline-2"
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="h-9 flex-1 rounded-control bg-accent-strong text-sm font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2 disabled:opacity-60"
        >
          {submitting ? 'Submitting…' : 'Submit payment details'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-control border border-hairline px-3 text-sm text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
