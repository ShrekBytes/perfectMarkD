import { useAccountStore } from '../auth/account-store';

/**
 * The top bar's quota chip (server/04): the signed-in paid user's Server
 * Export usage against their period allowance (plan quota + comps). Hidden
 * entirely for Free users and when signed out — the chip only ever describes
 * an active Entitlement. The account store refreshes it after sign-in and
 * whenever the server state may have moved (billing/04 calls refresh()).
 */
export function QuotaChip() {
  const entitlement = useAccountStore((state) => state.entitlement);
  if (!entitlement) return null;

  const { used, limit } = entitlement.quota;
  const exhausted = used >= limit;
  return (
    <span
      data-testid="quota-chip"
      data-exhausted={exhausted ? 'true' : undefined}
      title={
        exhausted
          ? `Server Export: all ${limit} of this period's exports are used — it resets next period`
          : `Server Export: ${used} of ${limit} exports used this period`
      }
      className={`flex h-8 select-none items-center rounded-control border px-2.5 text-xs tabular-nums ${
        exhausted
          ? 'border-danger/40 bg-danger/10 text-danger'
          : 'border-hairline text-ink-soft'
      }`}
    >
      {used}/{limit}
    </span>
  );
}
