import { useState } from 'react';
import { useAccountStore } from '../auth/account-store';
import { PricingModal } from '../pricing/PricingModal';

/**
 * The top bar's quota chip (server/04): the signed-in paid user's Server
 * Export usage against their period allowance (plan quota + comps). Hidden
 * entirely for Free users and when signed out — the chip only ever describes
 * an active Entitlement; a comped user's allowance surfaces in the Export
 * menu's Server Export item instead (billing/04). The account store refreshes
 * it after sign-in, after exports, and on its expiry watchdog (billing/04).
 *
 * At exhaustion the chip stops being a readout and becomes the recovery
 * path: a button that opens the pricing modal — the same route every gate
 * lock takes — because the only in-app fix for a used-up allowance is more
 * quota (the reset itself is explained in the title). A live allowance stays
 * a plain readout. Exhaustion is a state, not a failure: it renders as the
 * graphite inversion (DESIGN.md Graphite Inversion Rule), keeping --danger
 * for destructive actions and failure text only.
 */
export function QuotaChip() {
  const entitlement = useAccountStore((state) => state.entitlement);
  const quota = useAccountStore((state) => state.quota);
  const [pricingOpen, setPricingOpen] = useState(false);

  if (!entitlement || !quota) return null;

  const { used, limit } = quota;
  const exhausted = used >= limit;
  const chipClasses = `flex h-8 select-none items-center rounded-control border px-2.5 text-xs tabular-nums ${
    exhausted
      ? 'border-accent-strong bg-accent-strong text-accent-ink'
      : 'border-hairline text-ink-soft'
  }`;

  return (
    <>
      {exhausted ? (
        <button
          type="button"
          data-testid="quota-chip"
          data-exhausted="true"
          title={`Server Export: all ${limit} of this period's exports are used — it resets next period`}
          aria-label={`Server Export quota used up (${used} of ${limit}) — open plans`}
          onClick={() => setPricingOpen(true)}
          className={`${chipClasses} shrink-0 outline-offset-2 outline-accent transition-colors duration-150 hover:bg-accent-deep focus-visible:outline-2`}
        >
          {used}/{limit}
        </button>
      ) : (
        <span
          data-testid="quota-chip"
          title={`Server Export: ${used} of ${limit} exports used this period`}
          className={chipClasses}
        >
          {used}/{limit}
        </span>
      )}
      {pricingOpen && <PricingModal onClose={() => setPricingOpen(false)} />}
    </>
  );
}
