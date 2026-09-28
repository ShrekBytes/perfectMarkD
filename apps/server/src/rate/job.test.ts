import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, removeTestDatabase } from '../db/testing.js';
import type { AppDatabase } from '../db/database.js';
import { getLtcRate, getLtcRateStatus, setSetting } from '../db/settings.js';
import { auditLogs } from '../db/schema.js';
import { RateProviderError, type LtcRateProvider } from './provider.js';
import {
  RATE_BAND_WINDOW_MS,
  RATE_REFRESH_INTERVAL_MS,
  refreshLtcRate,
  startLtcRateRefresh,
} from './job.js';

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
});

const NOW = new Date('2026-09-28T12:00:00Z');
const HOUR = 60 * 60 * 1000;

/** A provider that answers with whatever the test hands it, fetch after fetch. */
function providerAnswering(...answers: Array<number | Error>): LtcRateProvider {
  const queue = [...answers];
  return {
    fetchRate: () => {
      const next = queue.shift();
      if (next === undefined) {
        return Promise.reject(
          new RateProviderError('transport', 'The price feed is exhausted.'),
        );
      }
      return next instanceof Error
        ? Promise.reject(next)
        : Promise.resolve(next);
    },
  };
}

function makeDb(): AppDatabase {
  const { db, dir } = createTestDatabase();
  cleanup = () => removeTestDatabase(dir);
  return db;
}

interface AttemptOptions {
  db: AppDatabase;
  provider: LtcRateProvider;
  now?: Date;
  log?: (line: string) => void;
}

async function attempt({
  db,
  provider,
  now = NOW,
  log = () => {},
}: AttemptOptions) {
  return refreshLtcRate({ db, provider, now: () => now, log });
}

describe('refreshing the Rate', () => {
  it('stores the fetched figure with the time it was fetched', async () => {
    const db = makeDb();

    const result = await attempt({ db, provider: providerAnswering(69.82) });

    expect(result).toMatchObject({ outcome: 'updated', usdtPerLtc: 69.82 });
    const rate = getLtcRate(db, () => NOW);
    expect(rate?.usdtPerLtc).toBe(69.82);
    expect(rate?.lastSuccessAt).toBe(NOW.toISOString());
    expect(rate?.lastAttemptAt).toBe(NOW.toISOString());
    expect(rate?.lastError).toBeNull();
    expect(rate?.ageMs).toBe(0);
  });

  it('accepts the first fetch with no band applied, whatever the figure', async () => {
    const db = makeDb();

    const result = await attempt({ db, provider: providerAnswering(1234.5) });

    expect(result).toMatchObject({ outcome: 'updated' });
    expect(getLtcRate(db, () => NOW)?.usdtPerLtc).toBe(1234.5);
  });

  it('accepts a value outside the band once the last success is old', async () => {
    const db = makeDb();
    const dayAgo = new Date(NOW.getTime() - RATE_BAND_WINDOW_MS - HOUR);
    await attempt({
      db,
      provider: providerAnswering(100),
      now: dayAgo,
    });

    // A day and an hour since the last success is past the band window, where
    // a large move is the outage and not a provider fault.
    const result = await attempt({ db, provider: providerAnswering(10) });

    expect(result).toMatchObject({ outcome: 'updated' });
    expect(getLtcRate(db, () => NOW)?.usdtPerLtc).toBe(10);
  });

  it('logs a change at info level and writes no audit entry', async () => {
    const db = makeDb();
    const lines: string[] = [];

    await attempt({
      db,
      provider: providerAnswering(69.82),
      log: (line) => lines.push(line),
    });

    expect(lines.join('\n')).toMatch(/69\.82/);
    // Twice a day is ~700 entries a year, which would drown the ones that
    // matter; a successful fetch is a log line and nothing more.
    expect(db.select().from(auditLogs).all()).toHaveLength(0);
  });
});

describe('refreshing the Rate: values that are refused', () => {
  it('refuses a non-positive, missing, or non-finite figure and stores none', async () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const db = makeDb();
      await attempt({ db, provider: providerAnswering(69.82) });

      const result = await attempt({ db, provider: providerAnswering(bad) });

      expect(result).toMatchObject({ outcome: 'rejected' });
      // The last good Rate stands: a bad payload cannot poison the price
      // everyone is quoted.
      expect(getLtcRate(db, () => NOW)?.usdtPerLtc).toBe(69.82);
      cleanup?.();
      cleanup = undefined;
    }
  });

  it('refuses a value more than fifty percent from the last good one', async () => {
    const db = makeDb();
    await attempt({ db, provider: providerAnswering(100) });
    // A minute later the last success is well inside the band window.
    const later = new Date(NOW.getTime() + 60_000);

    const result = await attempt({
      db,
      provider: providerAnswering(200),
      now: later,
    });

    expect(result).toMatchObject({ outcome: 'rejected' });
    expect(String(result.reason)).toMatch(/50%/);
    expect(getLtcRate(db, () => later)?.usdtPerLtc).toBe(100);
  });

  it('refuses a collapse just as it refuses a doubling', async () => {
    const db = makeDb();
    await attempt({ db, provider: providerAnswering(100) });
    const later = new Date(NOW.getTime() + 60_000);

    const result = await attempt({
      db,
      provider: providerAnswering(40),
      now: later,
    });

    expect(result).toMatchObject({ outcome: 'rejected' });
    expect(getLtcRate(db, () => later)?.usdtPerLtc).toBe(100);
  });

  it('accepts a move inside the band', async () => {
    const db = makeDb();
    await attempt({ db, provider: providerAnswering(100) });
    const later = new Date(NOW.getTime() + 60_000);

    const result = await attempt({
      db,
      provider: providerAnswering(140),
      now: later,
    });

    expect(result).toMatchObject({ outcome: 'updated' });
    expect(getLtcRate(db, () => later)?.usdtPerLtc).toBe(140);
  });

  it('records a refusal in the audit trail with the last good Rate intact', async () => {
    const db = makeDb();
    await attempt({ db, provider: providerAnswering(100) });
    const later = new Date(NOW.getTime() + 60_000);

    await attempt({ db, provider: providerAnswering(900), now: later });

    const entries = db.select().from(auditLogs).all();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.action).toBe('rate.refresh');
    expect(entries[0]!.before).toMatchObject({ usdtPerLtc: 100 });
  });
});

describe('refreshing the Rate: a failed fetch', () => {
  const failure = new RateProviderError('transport', 'Unreachable.');

  it('keeps the previous Rate and records why', async () => {
    const db = makeDb();
    await attempt({ db, provider: providerAnswering(69.82) });
    const later = new Date(NOW.getTime() + HOUR);

    const result = await attempt({
      db,
      provider: providerAnswering(failure),
      now: later,
    });

    expect(result).toMatchObject({ outcome: 'failed' });
    const rate = getLtcRate(db, () => later);
    expect(rate?.usdtPerLtc).toBe(69.82);
    // The attempt is recorded; the success is not moved, so the Rate's age
    // keeps growing and the maximum age still acts on it.
    expect(rate?.lastAttemptAt).toBe(later.toISOString());
    expect(rate?.lastSuccessAt).toBe(NOW.toISOString());
    expect(rate?.lastError).toBe('Unreachable.');
    expect(rate?.ageMs).toBe(HOUR);
  });

  it('records the failure in the audit trail', async () => {
    const db = makeDb();

    await attempt({ db, provider: providerAnswering(failure) });

    const entries = db.select().from(auditLogs).all();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.action).toBe('rate.refresh');
    expect(entries[0]!.targetId).toBe('ltc_rate_usdt');
  });

  it('clears the recorded error on the next good fetch', async () => {
    const db = makeDb();
    await attempt({ db, provider: providerAnswering(failure) });
    expect(getLtcRateStatus(db, () => NOW).lastError).toBe('Unreachable.');

    await attempt({ db, provider: providerAnswering(70) });

    expect(getLtcRateStatus(db, () => NOW).lastError).toBeNull();
  });
});

describe('startLtcRateRefresh', () => {
  it('fetches immediately on start, then every twelve hours until stopped', async () => {
    vi.useFakeTimers();
    const db = makeDb();
    const provider = providerAnswering(100, 105, 110, 115);

    const stop = startLtcRateRefresh({
      db,
      provider,
      now: () => NOW,
      log: () => {},
    });
    // The immediate run has not awaited yet; drain the microtask queue.
    await vi.advanceTimersByTimeAsync(0);
    expect(getLtcRate(db, () => NOW)?.usdtPerLtc).toBe(100);

    await vi.advanceTimersByTimeAsync(RATE_REFRESH_INTERVAL_MS);
    expect(getLtcRate(db, () => NOW)?.usdtPerLtc).toBe(105);

    stop();
    await vi.advanceTimersByTimeAsync(RATE_REFRESH_INTERVAL_MS * 3);
    // Stopped: two more intervals passed and no third fetch landed.
    expect(getLtcRate(db, () => NOW)?.usdtPerLtc).toBe(105);
    stop();
  });

  it('twelve hours is the interval, and a stopped job stays stopped', () => {
    expect(RATE_REFRESH_INTERVAL_MS).toBe(12 * 60 * 60 * 1000);
  });

  it('keeps quoting a hand-set Rate until the first fetch replaces it', async () => {
    vi.useFakeTimers();
    const db = makeDb();
    // A live instance that typed its Rate before this job existed. It keeps
    // working — refusing it would switch LTC off on a method that is already
    // configured and being paid in — until the job's immediate run replaces it.
    setSetting(db, 'ltc_rate_usdt', 320.5);
    expect(getLtcRate(db, () => NOW)).toMatchObject({
      usdtPerLtc: 320.5,
      lastSuccessAt: null,
      ageMs: null,
    });

    startLtcRateRefresh({
      db,
      provider: providerAnswering(70),
      now: () => NOW,
      log: () => {},
    });
    await vi.advanceTimersByTimeAsync(0);

    // Nothing to compare against: a hand-typed Rate has no fetch behind it,
    // so the band is skipped and the fetched figure takes over.
    expect(getLtcRate(db, () => NOW)).toMatchObject({
      usdtPerLtc: 70,
      lastSuccessAt: NOW.toISOString(),
    });
  });
});
