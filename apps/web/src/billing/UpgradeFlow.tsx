import { useEffect, useState } from 'react';
import { AuthForm, type AuthMode } from '../auth/AuthForm';
import type { AuthUser } from '../auth/api';
import { useAccountStore } from '../auth/account-store';
import {
  DURATIONS,
  priceForDuration,
  type DurationMonths,
} from '../pricing/plans';
import { createOrder, type Order } from './api';
import { PaymentForm } from './PaymentForm';
import { PaymentInstructions } from './PaymentInstructions';
import { METHOD_LABELS, PAYMENT_METHODS, type PaymentMethod } from './payment';

export type UpgradeStep =
  'details' | 'auth' | 'instructions' | 'payment' | 'submitted';

interface UpgradeFlowProps {
  /** The plan whose CTA started the flow. */
  plan: 'pro' | 'premium';
  /** Closes the surrounding dialog (from Done, or after a submitted order). */
  onClose: () => void;
}

/**
 * The upgrade flow (billing/01): pick duration + payment method → create the
 * account or sign in if needed → the server creates the Order → payment
 * instructions (Reference Code, wallet, network warning) → "I've sent the
 * payment" details → submitted. Everything after the Order exists is also
 * reachable later from the Upgrade status view.
 */
export function UpgradeFlow({ plan, onClose }: UpgradeFlowProps) {
  const user = useAccountStore((state) => state.user);
  const signedIn = useAccountStore((state) => state.signedIn);

  const [step, setStep] = useState<UpgradeStep>('details');
  const [durationMonths, setDurationMonths] = useState<DurationMonths>(1);
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>('USDT-TRC20');
  const [authMode, setAuthMode] = useState<AuthMode>('register');
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The flow can open from /pricing, outside the shell — make sure the
  // session has been checked before deciding that an account is needed.
  useEffect(() => {
    void useAccountStore.getState().load();
  }, []);

  const createTheOrder = async () => {
    setError(null);
    setBusy(true);
    try {
      const created = await createOrder({
        plan,
        durationMonths,
        paymentMethod,
      });
      setOrder(created);
      setStep('instructions');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
      );
    } finally {
      setBusy(false);
    }
  };

  const onContinue = () => {
    // Account first: the Order belongs to a user. Auth keeps the context —
    // once signed in, the order is created immediately. Read the latest store
    // state, not the closure's snapshot, so a session established moments ago
    // (or still resolving) counts.
    if (!useAccountStore.getState().user) {
      setStep('auth');
      return;
    }
    void createTheOrder();
  };

  const onAuthenticated = (authenticated: AuthUser) => {
    signedIn(authenticated);
    void createTheOrder();
  };

  return (
    <div data-testid="upgrade-flow" className="text-sm">
      {step === 'details' && (
        <div data-testid="upgrade-step-details">
          <p className="text-xs text-ink-soft">
            Pick how long and how you'll pay. The exact amount is fixed when the
            order is created — nothing auto-renews.
          </p>

          <fieldset className="mt-4">
            <legend className="text-xs font-medium text-ink-soft">
              Duration
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {DURATIONS.map((months) => {
                const selected = durationMonths === months;
                return (
                  <button
                    key={months}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setDurationMonths(months)}
                    className={`rounded-control border px-3 py-2 text-left transition-colors duration-150 outline-offset-2 outline-accent focus-visible:outline-2 ${
                      selected
                        ? 'border-ink bg-canvas'
                        : 'border-hairline hover:bg-surface-hover'
                    }`}
                  >
                    <span className="block font-medium text-ink">
                      {months} {months === 1 ? 'month' : 'months'}
                    </span>
                    <span className="block text-xs text-ink-soft">
                      {priceForDuration(plan, months)} USDT
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="mt-4">
            <legend className="text-xs font-medium text-ink-soft">
              Payment method
            </legend>
            <div className="mt-2 space-y-2">
              {PAYMENT_METHODS.map((method) => {
                const selected = paymentMethod === method;
                return (
                  <button
                    key={method}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setPaymentMethod(method)}
                    className={`touch-target flex w-full items-center rounded-control border px-3 py-2 text-left transition-colors duration-150 outline-offset-2 outline-accent focus-visible:outline-2 ${
                      selected
                        ? 'border-ink bg-canvas'
                        : 'border-hairline hover:bg-surface-hover'
                    }`}
                  >
                    <span className="font-medium text-ink">
                      {METHOD_LABELS[method]}
                    </span>
                    {selected && (
                      <span className="ml-auto text-xs font-medium text-ink">
                        Selected
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <p className="mt-4 text-sm text-ink">
            Total:{' '}
            <span data-testid="upgrade-total" className="font-semibold">
              {priceForDuration(plan, durationMonths)} USDT
            </span>
          </p>

          {error && (
            <p role="alert" className="mt-3 text-xs text-danger">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={onContinue}
            disabled={busy}
            className="touch-target mt-4 h-9 w-full rounded-control bg-accent-strong text-sm font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2 disabled:opacity-60"
          >
            {busy
              ? 'Creating order…'
              : user
                ? 'Create order'
                : 'Continue — sign in or create an account'}
          </button>
        </div>
      )}

      {step === 'auth' && (
        <div data-testid="upgrade-step-auth">
          <h3 className="text-base font-semibold text-ink">
            One quick step first
          </h3>
          <p className="mt-1 text-xs text-ink-soft">
            Orders belong to an account, so your plan can be tracked and
            granted. Create a free one, or sign in — your selection is kept.
          </p>

          <div className="mt-4">
            <AuthForm
              mode={authMode}
              onAuthenticated={onAuthenticated}
              onSwitchMode={() =>
                setAuthMode((mode) =>
                  mode === 'register' ? 'login' : 'register',
                )
              }
            />
          </div>

          <button
            type="button"
            onClick={() => setStep('details')}
            className="touch-target mt-3 text-xs text-ink-soft outline-offset-2 outline-accent hover:text-ink focus-visible:outline-2"
          >
            ← Back to plan details
          </button>
        </div>
      )}

      {step === 'instructions' && order && (
        <div data-testid="upgrade-step-instructions">
          <h3 className="text-base font-semibold text-ink">Send the payment</h3>
          <p className="mt-1 text-xs text-ink-soft">
            Order{' '}
            <span className="font-mono font-semibold text-ink">
              {order.referenceCode}
            </span>{' '}
            created — pay exactly the amount below, then submit your transaction
            details.
          </p>

          <div className="mt-3">
            <PaymentInstructions order={order} />
          </div>

          <button
            type="button"
            onClick={() => setStep('payment')}
            className="touch-target mt-4 h-9 w-full rounded-control bg-accent-strong text-sm font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2"
          >
            I've sent the payment
          </button>
          <button
            type="button"
            onClick={onClose}
            className="touch-target mt-2 h-9 w-full rounded-control border border-hairline text-sm text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
          >
            Pay later — the order is saved in Upgrade status
          </button>
        </div>
      )}

      {step === 'payment' && order && (
        <div data-testid="upgrade-step-payment">
          <h3 className="text-base font-semibold text-ink">Payment details</h3>
          <p className="mt-1 text-xs text-ink-soft">
            For order{' '}
            <span className="font-mono font-semibold text-ink">
              {order.referenceCode}
            </span>
            . These go to the Admin, who matches them against the blockchain.
          </p>

          <div className="mt-4">
            <PaymentForm
              order={order}
              onSubmitted={(updated) => {
                setOrder(updated);
                setStep('submitted');
              }}
              onCancel={() => setStep('instructions')}
            />
          </div>
        </div>
      )}

      {step === 'submitted' && order && (
        <div data-testid="upgrade-step-submitted" className="text-center">
          <h3 className="text-base font-semibold text-ink">
            Order {order.referenceCode} submitted
          </h3>
          <p className="mx-auto mt-2 max-w-prose text-xs text-ink-soft">
            Verification is manual, so this can take a little while. Follow it
            under <span className="text-ink">Upgrade status</span> in the
            account menu — if anything doesn't match, you'll see the reason and
            can resubmit.
          </p>

          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="touch-target mt-4 h-9 w-full rounded-control bg-accent-strong text-sm font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
