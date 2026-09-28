// ─────────────────────────────────────────────────────────────────────────────
// The Rate refresh job (live-pricing/02, ADR-0014).
//
// The Rate is machine-written. A scheduled job fetches it from the public price
// feed every twelve hours, validates the answer before anything is stored, and
// keeps the last good value when a fetch fails. Nobody — the Admin included —
// can type it, which is what makes the number a customer is quoted something
// the operator did not choose.
//
// The shape follows the Export History purge (server/05): an injectable clock,
// an interval, one run immediately on start, and a stop function the
// composition root calls on shutdown.
// ─────────────────────────────────────────────────────────────────────────────

import { LTC_RATE_KEY, getLtcRateStatus, setSetting } from '../db/settings.js';
import type { AppDatabase } from '../db/database.js';
import { auditLogs } from '../db/schema.js';
import type { Clock } from '../auth/sessions.js';
import type { LogSink } from '../request-logger.js';
import type { LtcRateProvider } from './provider.js';

/** The job's cadence: twice a day, matching the staleness policy in ADR-0014. */
export const RATE_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;

/**
 * How far the feed may be from the last good Rate before the answer is treated
 * as a provider fault rather than a market move. A real LTC move of this size
 * inside a day is news; a feed reporting one is a broken feed, and storing it
 * would re-price every open quote on a bad number.
 */
const RATE_BAND = 0.5;

/**
 * The band only applies while the last good Rate is younger than this. After a
 * longer outage the band is the wrong instrument — a real 50% move may have
 * happened while nothing was fetching — and the maximum age is what should act.
 */
export const RATE_BAND_WINDOW_MS = 24 * 60 * 60 * 1000;

export const RATE_AUDIT_ACTION = 'rate.refresh';

/** Where the fetch ended. `rejected` is a provider fault; `failed` is a
 *  transport fault. Neither writes a Rate. */
export type RateRefreshOutcome = 'updated' | 'rejected' | 'failed';

export interface RateRefreshResult {
  outcome: RateRefreshOutcome;
  /** The accepted figure, when one was accepted. */
  usdtPerLtc: number | null;
  /** Why the answer was refused — logged, recorded, and shown to the Admin. */
  reason: string | null;
}

export interface RateRefreshOptions {
  db: AppDatabase;
  provider: LtcRateProvider;
  /** Injectable clock; the fetch's own timestamps and the band use it. */
  now: Clock;
  /** Change is logged here at info level; silent by default in tests. */
  log?: LogSink;
}

/**
 * One fetch, validated and stored. A refusal never writes a figure: it records
 * why, keeps the Rate the instance already had, and leaves its age alone.
 */
export async function refreshLtcRate({
  db,
  provider,
  now,
  log = () => {},
}: RateRefreshOptions): Promise<RateRefreshResult> {
  const at = now();
  const previous = getLtcRateStatus(db, now);

  let candidate: number;
  try {
    candidate = await provider.fetchRate();
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.message
        : 'The price feed could not be read.';
    recordFailure(db, previous, at, reason, log);
    return { outcome: 'failed', usdtPerLtc: null, reason };
  }

  const rejection = validateFetchedRate(candidate, previous.rate);
  if (rejection !== null) {
    recordFailure(db, previous, at, rejection, log);
    return { outcome: 'rejected', usdtPerLtc: null, reason: rejection };
  }

  setSetting(db, LTC_RATE_KEY, {
    usdtPerLtc: candidate,
    lastSuccessAt: at.toISOString(),
    lastAttemptAt: at.toISOString(),
    // A success clears the last error: the panel's warning is about the last
    // attempt, and a rate that is fetching fine should not read as failing.
    lastError: null,
  });
  log(`rate refresh: stored ${candidate} USDT per LTC`);
  return { outcome: 'updated', usdtPerLtc: candidate, reason: null };
}

/**
 * The rules that stand between a payload and the price every open Order is
 * quoted: a positive, finite number, and — only while there is a recent Rate
 * to compare against — within the band. Returns why the value is refused, or
 * null when it is accepted. Nothing here clamps: a bad answer is rejected.
 */
function validateFetchedRate(
  candidate: number,
  previous: ReturnType<typeof getLtcRateStatus>['rate'],
): string | null {
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
    return 'The price feed returned a value that is not a number.';
  }
  if (candidate <= 0) {
    return 'The price feed returned a price of zero or less.';
  }
  // The first fetch has nothing to compare against and skips the band
  // entirely — including a Rate a human typed before this job existed, whose
  // age is unknown for the same reason.
  if (previous === null || previous.ageMs === null) return null;
  if (previous.ageMs >= RATE_BAND_WINDOW_MS) return null;
  const drift = Math.abs(candidate - previous.usdtPerLtc) / previous.usdtPerLtc;
  if (drift > RATE_BAND) {
    return `The price feed returned ${candidate}, more than 50% from the last good Rate of ${previous.usdtPerLtc} — refused as a provider fault.`;
  }
  return null;
}

/**
 * A refusal is one of the few things a background job is worth an audit entry
 * for: the Rate stopped being trustworthy and the panel will say so. The
 * success path deliberately writes none.
 */
function recordFailure(
  db: AppDatabase,
  previous: ReturnType<typeof getLtcRateStatus>,
  at: Date,
  reason: string,
  log: LogSink,
): void {
  setSetting(db, LTC_RATE_KEY, {
    usdtPerLtc: previous.rate?.usdtPerLtc ?? null,
    lastSuccessAt: previous.rate?.lastSuccessAt ?? null,
    lastAttemptAt: at.toISOString(),
    lastError: reason,
  });
  log(`rate refresh: ${reason} The last good rate was kept.`);
  db.insert(auditLogs)
    .values({
      // The job runs as the instance, not as a person. audit_logs requires an
      // admin identity; this entry is attributable to the scheduler, and the
      // operator is the one who reads it.
      adminUserId: 0,
      adminEmail: RATE_AUDIT_ACTOR,
      action: RATE_AUDIT_ACTION,
      targetType: 'settings',
      targetId: LTC_RATE_KEY,
      before:
        previous.rate === null
          ? null
          : { usdtPerLtc: previous.rate.usdtPerLtc },
      after: { lastError: reason, at: at.toISOString() },
      createdAt: at,
    })
    .run();
}

/** The actor recorded on a rate audit entry; never a signed-in Admin. */
const RATE_AUDIT_ACTOR = 'system:rate-refresh';

export interface RateRefreshJobOptions extends RateRefreshOptions {
  /** Fetch cadence; the ticket's number is every twelve hours. */
  intervalMs?: number;
}

/**
 * Starts the refresh: one fetch immediately (so a restarted process quotes a
 * current Rate without waiting out the interval), then one per interval.
 * Returns the stop function — call it on shutdown to release the timer.
 */
export function startLtcRateRefresh({
  intervalMs = RATE_REFRESH_INTERVAL_MS,
  ...options
}: RateRefreshJobOptions): () => void {
  const fetchOnce = (): void => {
    // A rejection is already recorded and logged by refreshLtcRate; the timer
    // must survive it, so nothing here throws.
    void refreshLtcRate(options);
  };
  fetchOnce();
  const timer = setInterval(fetchOnce, intervalMs);
  return () => clearInterval(timer);
}
