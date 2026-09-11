import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, removeTestDatabase } from './db/testing.js';
import type { AppDatabase } from './db/database.js';
import {
  entitlements,
  exportUsage,
  users,
  type PlanLimits,
} from './db/schema.js';
import { setSetting, LIMITS_KEY } from './db/settings.js';
import { quotaState, usagePeriod } from './quota.js';

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function makeDb(): AppDatabase {
  const { db, dir } = createTestDatabase();
  cleanup = () => removeTestDatabase(dir);
  return db;
}

/** Tight limits so tests can exhaust a quota without looping exports. */
const TEST_LIMITS: PlanLimits = {
  pro: { pageCap: 300, quotaMonthly: 2 },
  premium: { pageCap: 1000, quotaMonthly: 5 },
};

function insertUser(db: AppDatabase): number {
  return db
    .insert(users)
    .values({ email: `u${Math.random()}@test.dev`, passwordHash: 'x' })
    .returning({ id: users.id })
    .get()!.id;
}

function grant(
  db: AppDatabase,
  userId: number,
  plan: 'pro' | 'premium',
  expiresInDays: number,
): { plan: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  db.insert(entitlements).values({ userId, plan, expiresAt }).run();
  return { plan, expiresAt };
}

function seedUsage(
  db: AppDatabase,
  userId: number,
  period: string,
  count: number,
  comps = 0,
): void {
  db.insert(exportUsage).values({ userId, period, count, comps }).run();
}

describe('usagePeriod', () => {
  it('formats the UTC month as YYYY-MM, zero-padded', () => {
    expect(usagePeriod(new Date(Date.UTC(2026, 0, 9)))).toBe('2026-01');
    expect(usagePeriod(new Date(Date.UTC(2026, 11, 31, 23, 59)))).toBe(
      '2026-12',
    );
  });

  it('uses UTC, not the host timezone', () => {
    // 2026-02-01 00:30 UTC is still January for UTC-2 and later; the period
    // must not depend on where the server runs.
    expect(usagePeriod(new Date(Date.UTC(2026, 1, 1, 0, 30)))).toBe('2026-02');
  });
});

describe('quotaState', () => {
  it('reads zero for a user with no usage row', () => {
    const db = makeDb();
    setSetting(db, LIMITS_KEY, TEST_LIMITS);
    const userId = insertUser(db);
    const ent = grant(db, userId, 'pro', 30);

    expect(quotaState(db, userId, ent, TEST_LIMITS, new Date())).toEqual({
      used: 0,
      comps: 0,
      limit: 2,
    });
  });

  it('counts only the current period — last month does not carry over', () => {
    const db = makeDb();
    setSetting(db, LIMITS_KEY, TEST_LIMITS);
    const userId = insertUser(db);
    const ent = grant(db, userId, 'pro', 30);
    const now = new Date();
    const lastMonth = new Date(now);
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    seedUsage(db, userId, usagePeriod(lastMonth), TEST_LIMITS.pro.quotaMonthly);

    expect(quotaState(db, userId, ent, TEST_LIMITS, now)).toMatchObject({
      used: 0,
      limit: 2,
    });
  });

  it('adds comps to the plan quota', () => {
    const db = makeDb();
    setSetting(db, LIMITS_KEY, TEST_LIMITS);
    const userId = insertUser(db);
    const ent = grant(db, userId, 'pro', 30);
    seedUsage(db, userId, usagePeriod(new Date()), 1, 3);

    expect(quotaState(db, userId, ent, TEST_LIMITS, new Date())).toEqual({
      used: 1,
      comps: 3,
      limit: 5,
    });
  });

  it('an expired Entitlement contributes no plan quota, but comps survive', () => {
    const db = makeDb();
    setSetting(db, LIMITS_KEY, TEST_LIMITS);
    const userId = insertUser(db);
    const ent = grant(db, userId, 'premium', -1);
    seedUsage(db, userId, usagePeriod(new Date()), 1, 2);

    expect(quotaState(db, userId, ent, TEST_LIMITS, new Date())).toEqual({
      used: 1,
      comps: 2,
      limit: 2,
    });
  });

  it('an expired Entitlement counts as expired exactly at the expiry instant', () => {
    const db = makeDb();
    setSetting(db, LIMITS_KEY, TEST_LIMITS);
    const userId = insertUser(db);
    const now = new Date('2026-06-15T12:00:00Z');

    expect(
      quotaState(
        db,
        userId,
        { plan: 'pro', expiresAt: new Date('2026-06-15T12:00:00Z') },
        TEST_LIMITS,
        now,
      ),
    ).toMatchObject({ limit: 0 });
    expect(
      quotaState(
        db,
        userId,
        { plan: 'pro', expiresAt: new Date('2026-06-15T12:00:01Z') },
        TEST_LIMITS,
        now,
      ),
    ).toMatchObject({ limit: 2 });
  });

  it('deletes with the user (FK cascade)', () => {
    const db = makeDb();
    const userId = insertUser(db);
    seedUsage(db, userId, usagePeriod(new Date()), 4);
    db.delete(users).where(eq(users.id, userId)).run();
    expect(
      db.select().from(exportUsage).where(eq(exportUsage.userId, userId)).all(),
    ).toEqual([]);
  });
});
