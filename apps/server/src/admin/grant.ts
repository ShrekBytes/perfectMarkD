// ─────────────────────────────────────────────────────────────────────────────
// Entitlement grant parsing (billing/02, billing/03). One parser for both
// paths that grant an Entitlement — verifying an Order and the Admin's manual
// grant — so the two can never drift apart on durations, custom expiries, or
// the stacking inputs they accept.
// ─────────────────────────────────────────────────────────────────────────────

import { DURATION_MONTHS } from '../db/schema.js';
import { asRecord } from '../request-body.js';

/** A duration (stacked onto the current Entitlement) or an exact date. */
export type GrantInput = { durationMonths: number } | { expiresAt: Date };

/** The last millisecond of the given day, UTC. */
export function endOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

/**
 * A grant accepts either a preset duration or an exact custom expiry — never
 * both. Date-only strings run through the end of the chosen day: an admin
 * picking "2027-01-05" means the plan is good through January 5th, not that
 * it dies at midnight going in.
 */
export function parseGrant(
  body: unknown,
  now: Date,
): GrantInput | { error: string } {
  const record = asRecord(body);
  if (!record) {
    return { error: 'Expected a JSON object.' };
  }
  const hasDuration = record.durationMonths !== undefined;
  const hasExpiresAt = record.expiresAt !== undefined;
  if (hasDuration && hasExpiresAt) {
    return { error: 'Choose either a duration or an expiry date, not both.' };
  }
  if (hasDuration) {
    if (
      typeof record.durationMonths !== 'number' ||
      !DURATION_MONTHS.includes(record.durationMonths as 1 | 3 | 6 | 12)
    ) {
      return { error: 'Choose a duration of 1, 3, 6, or 12 months.' };
    }
    return { durationMonths: record.durationMonths };
  }
  if (hasExpiresAt) {
    if (typeof record.expiresAt !== 'string') {
      return { error: 'Enter an expiry date.' };
    }
    const value = record.expiresAt.trim();
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const parsed = new Date(dateOnly ? `${value}T00:00:00Z` : value);
    if (Number.isNaN(parsed.getTime())) {
      return { error: 'Enter a valid expiry date.' };
    }
    const expiresAt = dateOnly ? endOfUtcDay(parsed) : parsed;
    if (expiresAt.getTime() <= now.getTime()) {
      return { error: 'The expiry date must be in the future.' };
    }
    return { expiresAt };
  }
  return { error: 'Choose a duration or an expiry date for the entitlement.' };
}
