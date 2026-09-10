import type { Order } from './api';
import { CopyButton } from './CopyButton';
import { networkWarning } from './payment';

/**
 * What the user needs to actually send a Manual Payment (ADR-0005): the
 * amount, the Reference Code, the receiving address — each one click to copy —
 * and the network warning, because money sent on the wrong network is gone.
 */
export function PaymentInstructions({ order }: { order: Order }) {
  const ltc = order.coin === 'LTC';
  const usdtTotal =
    ltc && order.ltcRateUsdt
      ? (Number(order.amountExpected) * Number(order.ltcRateUsdt)).toFixed(2)
      : null;

  return (
    <div
      data-testid="payment-instructions"
      className="rounded-pane border border-hairline bg-canvas p-4"
    >
      <p className="text-sm">
        <span className="text-ink-soft">Amount due </span>
        <span
          data-testid="order-amount"
          className="font-mono font-semibold text-ink"
        >
          {order.amountExpected} {order.coin}
        </span>
        {ltc && usdtTotal && (
          <span className="block text-xs text-ink-soft">
            ≈ {usdtTotal} USDT — LTC rate captured when the order was created:{' '}
            {order.ltcRateUsdt} USDT/LTC
          </span>
        )}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-ink-soft">Reference Code</p>
          <p className="truncate font-mono text-sm text-ink">
            {order.referenceCode}
          </p>
        </div>
        <CopyButton value={order.referenceCode} label="Copy reference code" />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-ink-soft">
            {order.coin === 'LTC' ? 'Litecoin address' : 'USDT address'}
          </p>
          <p className="truncate font-mono text-sm text-ink">
            {order.walletAddress}
          </p>
        </div>
        <CopyButton
          value={order.walletAddress ?? ''}
          label="Copy wallet address"
        />
      </div>

      <p
        role="note"
        className="mt-3 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
      >
        {networkWarning(order.network)}
      </p>
    </div>
  );
}
