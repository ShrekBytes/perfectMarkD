import { useAccountStore } from '../auth/account-store';

/**
 * The top bar's quota chip (server/04): the signed-in paid user's Server
 * Export usage against their period allowance (plan quota + comps). Hidden
 * entirely for Free users and when signed out — the chip only ever describes
 * an active Entitlement; a comped user's allowance surfaces in the Export
 * menu's Server Export item instead (billing/04). The account store refreshes
 * it after sign-in, after exports, and on its expiry watchdog (billing/04).
 */
export function QuotaChip() {
  const entitlement = useAccountStore((state) => state.entitlement);
  const quota = useAccountStore((state) => state.quota);
  if (!entitlement || !quota) return null;

  const { used, limit } = quota;
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
