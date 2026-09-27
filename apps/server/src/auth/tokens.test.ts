import { afterEach, describe, expect, it } from 'vitest';
import { createTestDatabase, removeTestDatabase } from '../db/testing.js';
import type { AppDatabase } from '../db/database.js';
import { emailTokens, users } from '../db/schema.js';
import {
  VERIFICATION_TOKEN_TTL_MS,
  issueToken,
  oneTimeLink,
  redeemToken,
  type TokenPurpose,
} from './tokens.js';

const NOW = new Date('2026-09-27T12:00:00.000Z');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

/** A fresh database with one account in it — a link needs somewhere to point. */
function makeDb(): { db: AppDatabase; userId: number } {
  const { db, dir } = createTestDatabase();
  cleanup = () => removeTestDatabase(dir);
  const userId = db
    .insert(users)
    .values({ email: 'ada@example.com', passwordHash: 'hash' })
    .returning({ id: users.id })
    .get().id;
  return { db, userId };
}

describe('issueToken', () => {
  it('stores only the digest, and hands the raw token back', () => {
    const { db, userId } = makeDb();

    const token = issueToken(db, { purpose: 'verification', userId }, NOW);

    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const rows = db.select().from(emailTokens).all();
    expect(rows).toHaveLength(1);
    // The raw value is nowhere in the database: a dump cannot be replayed.
    expect(rows[0]?.token).not.toBe(token);
    expect(rows[0]?.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('expires 24 hours out for a verification link', () => {
    const { db, userId } = makeDb();

    issueToken(db, { purpose: 'verification', userId }, NOW);

    expect(db.select().from(emailTokens).get()?.expiresAt).toEqual(
      new Date(NOW.getTime() + VERIFICATION_TOKEN_TTL_MS),
    );
  });
});

describe('redeemToken', () => {
  it('returns the account once and refuses a second redemption', () => {
    const { db, userId } = makeDb();
    const token = issueToken(db, { purpose: 'verification', userId }, NOW);

    expect(redeemToken(db, 'verification', token, NOW)).toEqual({
      userId,
      payload: null,
    });
    // One-time: the same link a second time buys nothing.
    expect(redeemToken(db, 'verification', token, NOW)).toBeNull();
  });

  it('refuses an expired link', () => {
    const { db, userId } = makeDb();
    const token = issueToken(db, { purpose: 'verification', userId }, NOW);

    const afterExpiry = new Date(NOW.getTime() + VERIFICATION_TOKEN_TTL_MS + 1);
    expect(redeemToken(db, 'verification', token, afterExpiry)).toBeNull();
  });

  it('refuses an unknown token', () => {
    const { db } = makeDb();
    expect(redeemToken(db, 'verification', 'not-a-token', NOW)).toBeNull();
  });

  it('refuses a token spent as a different purpose', () => {
    // The purpose is the link's authority: one flow's token can never be
    // redeemed as another's. (`password_reset` is email/03's.)
    const { db, userId } = makeDb();
    const token = issueToken(db, { purpose: 'verification', userId }, NOW);
    const other = 'password_reset' as TokenPurpose;

    expect(redeemToken(db, other, token, NOW)).toBeNull();
    // Still redeemable as what it actually is.
    expect(redeemToken(db, 'verification', token, NOW)).toEqual({
      userId,
      payload: null,
    });
  });

  it('carries the payload a flow stores on the link', () => {
    const { db, userId } = makeDb();
    const token = issueToken(
      db,
      { purpose: 'verification', userId, payload: 'new@example.com' },
      NOW,
    );

    expect(redeemToken(db, 'verification', token, NOW)).toEqual({
      userId,
      payload: 'new@example.com',
    });
  });
});

describe('the opportunistic sweep', () => {
  it('collects spent and expired links when a new one is issued', () => {
    const { db, userId } = makeDb();
    const spent = issueToken(db, { purpose: 'verification', userId }, NOW);
    redeemToken(db, 'verification', spent, NOW);
    // A link whose 24 hours are already up (an idle row, or a resend a day
    // later).
    issueToken(
      db,
      { purpose: 'verification', userId },
      new Date(NOW.getTime() - VERIFICATION_TOKEN_TTL_MS - 1),
    );

    const live = issueToken(db, { purpose: 'verification', userId }, NOW);

    expect(db.select().from(emailTokens).all()).toHaveLength(1);
    expect(redeemToken(db, 'verification', live, NOW)).toEqual({
      userId,
      payload: null,
    });
    expect(redeemToken(db, 'verification', spent, NOW)).toBeNull();
  });
});

describe('oneTimeLink', () => {
  it('joins the public origin, the SPA path, and the token', () => {
    expect(
      oneTimeLink(
        'https://perfectmarkd.example.com',
        '/verify-email',
        'a token/with+odd chars',
      ),
    ).toBe(
      'https://perfectmarkd.example.com/verify-email?token=a%20token%2Fwith%2Bodd%20chars',
    );
  });
});
