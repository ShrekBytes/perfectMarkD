// ─────────────────────────────────────────────────────────────────────────────
// Entitlement grant arithmetic (billing/02, spec §Entitlement rules). Pure
// date math so the stacking rule is testable apart from HTTP and SQL. All
// dates are UTC; a granted duration always lands on the same day-of-month,
// clamped when the target month is shorter (Jan 31 + 1 month → Feb 28).
// ─────────────────────────────────────────────────────────────────────────────

/** Adds calendar months in UTC, clamping day-of-month overflow. */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCMonth(result.getUTCMonth() + months);
  if (result.getUTCDate() !== day) {
    // The month overflowed into the next one (e.g. Feb 31 → Mar 2);
    // day 0 is the last day of the previous month.
    result.setUTCDate(0);
  }
  return result;
}

/**
 * The expiry a duration grant lands on: from the current expiry while the
 * Entitlement is still active (stacking durations), otherwise from now.
 * An Entitlement expiring exactly now counts as expired.
 */
export function expiryForGrant(
  now: Date,
  currentExpiresAt: Date | null,
  durationMonths: number,
): Date {
  const base =
    currentExpiresAt && currentExpiresAt.getTime() > now.getTime()
      ? currentExpiresAt
      : now;
  return addMonths(base, durationMonths);
}
