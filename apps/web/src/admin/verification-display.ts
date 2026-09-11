// ─────────────────────────────────────────────────────────────────────────────
// Display helpers for the admin Verification queue (billing/02). Mirrors the
// server's canonical sets — apps/server/src/db/schema.ts owns the truth; this
// module only labels it and renders the comparisons the Admin decides with.
// ─────────────────────────────────────────────────────────────────────────────

import type { Network } from '../billing/api';

const EXPLORERS: Record<Network, (txid: string) => string> = {
  TRC20: (txid) => `https://tronscan.org/#/transaction/${txid}`,
  BEP20: (txid) => `https://bscscan.com/tx/${txid}`,
  mainnet: (txid) => `https://blockchair.com/litecoin/transaction/${txid}`,
};

/** On-chain deep link for a submitted txid, per the Order's network. */
export function explorerUrl(network: Network, txid: string): string {
  return EXPLORERS[network](txid);
}

/**
 * Whether the claimed amount matches the expected one. Both are decimal
 * strings in the Order's coin; numeric equality (not string equality) so
 * `3` and `3.00000000` count as paid.
 */
export function amountsMatch(
  expected: string,
  claimed: string | null,
): boolean {
  if (claimed === null) return false;
  const expectedValue = Number(expected);
  const claimedValue = Number(claimed);
  if (!Number.isFinite(expectedValue) || !Number.isFinite(claimedValue)) {
    return false;
  }
  return expectedValue === claimedValue;
}

/** Adds calendar months in UTC, clamping day-of-month overflow. */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCMonth(result.getUTCMonth() + months);
  if (result.getUTCDate() !== day) {
    result.setUTCDate(0);
  }
  return result;
}

/**
 * Where a duration grant would land (the stacking rule, spec §Entitlement
 * rules): from the current expiry while it is still active, otherwise from
 * now. A preview for the Verify dialog — the server's grant remains the
 * authority; this only lets the Admin see the date before committing.
 */
export function previewExpiry(
  currentExpiresAt: string | null,
  durationMonths: number,
  now: Date,
): string {
  const current = currentExpiresAt ? new Date(currentExpiresAt) : null;
  const base = current && current.getTime() > now.getTime() ? current : now;
  return addMonths(base, durationMonths).toISOString().slice(0, 10);
}
