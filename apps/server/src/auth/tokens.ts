// ─────────────────────────────────────────────────────────────────────────────
// The one-time links in transactional email (ADR-0013, email/02).
//
// Opaque 256-bit tokens, stored only as a digest, single-use and expiring. One
// table for every purpose (schema.ts), so a link's authority is its purpose: a
// reset token can never be redeemed as a verification, and one sweep removes
// every flow's spent rows.
//
// The raw token leaves the server exactly once — inside the absolute link the
// Mailer sends. `oneTimeLink` here knows the link's shape and the route knows
// the public origin, so the two meet in the route: the Mailer's own contract is
// that it never sees anything but an address and a URL (ADR-0013).
//
// Spent and expired rows are swept opportunistically by the flow that issues a
// link, not by a timer: the table only grows when a message goes out, so the
// moment a message goes out is the moment its predecessors are collected.
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq, gt, isNotNull, isNull, lte, or } from 'drizzle-orm';
import type { AppDatabase } from '../db/database.js';
import { emailTokens, type TokenPurpose } from '../db/schema.js';
import { hashOpaqueToken, newOpaqueToken } from './opaque-token.js';

export type { TokenPurpose };

/** Email Verification links live 24 hours (spec §One-time tokens). */
export const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Password Reset links live 30 minutes (spec §One-time tokens). A reset link
 * hands over the account, so its window is minutes where a verification link
 * has a day: the second an address is proven, the link is spent and worthless.
 */
export const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/**
 * Email Change links live 24 hours. The requester already proved the current
 * password, so this link carries no authority it does not already hold — it
 * moves the account's mail, it does not open the account (the password is
 * untouched) — which makes it a convenience rather than a recovery, and a day is
 * the most exposure that convenience is worth.
 */
export const EMAIL_CHANGE_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * How long each kind of link stays live. Keyed by purpose so a new flow brings
 * its own length with it and cannot inherit someone else's — a reset link
 * quietly living for 24 hours would be a quiet hole in this feature.
 */
const TOKEN_TTL_MS = {
  verification: VERIFICATION_TOKEN_TTL_MS,
  password_reset: PASSWORD_RESET_TOKEN_TTL_MS,
  email_change: EMAIL_CHANGE_TOKEN_TTL_MS,
} satisfies Record<TokenPurpose, number>;

/** What a redeemed link carries back to the flow that spends it. */
export interface RedeemedToken {
  userId: number;
  /** The flow's own data, when the link has any (email/04's new address). */
  payload: string | null;
}

export interface IssueTokenOptions {
  purpose: TokenPurpose;
  userId: number;
  payload?: string | null;
}

/** Issues a one-time token and returns the raw value to put in the link.
 *
 *  Collecting the previous links rides along: the table only grows when a
 *  message goes out, so issuing is the moment spent and expired rows are swept
 *  — no timer, nothing to schedule, and the table cannot outlive its links. */
export function issueToken(
  db: AppDatabase,
  { purpose, userId, payload = null }: IssueTokenOptions,
  now: Date = new Date(),
): string {
  sweepSpentTokens(db, now);
  const token = newOpaqueToken();
  db.insert(emailTokens)
    .values({
      token: hashOpaqueToken(token),
      purpose,
      userId,
      payload,
      expiresAt: new Date(now.getTime() + TOKEN_TTL_MS[purpose]),
    })
    .run();
  return token;
}

/**
 * Spends a token, marking it used in the same statement that read it — so a
 * link presented twice, or twice at once, redeems once. Returns null for
 * anything that is not a live token of this purpose: unknown, expired, already
 * spent, or issued for another flow. The caller shows one recovery for all four.
 */
export function redeemToken(
  db: AppDatabase,
  purpose: TokenPurpose,
  token: string,
  now: Date = new Date(),
): RedeemedToken | null {
  const redeemed = db
    .update(emailTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(emailTokens.token, hashOpaqueToken(token)),
        eq(emailTokens.purpose, purpose),
        isNull(emailTokens.usedAt),
        gt(emailTokens.expiresAt, now),
      ),
    )
    .returning({ userId: emailTokens.userId, payload: emailTokens.payload })
    .get();
  return redeemed ?? null;
}

/** Deletes every spent and expired row. See issueToken, which is its only
 *  caller. */
function sweepSpentTokens(db: AppDatabase, now: Date): number {
  return db
    .delete(emailTokens)
    .where(or(isNotNull(emailTokens.usedAt), lte(emailTokens.expiresAt, now)))
    .returning({ token: emailTokens.token })
    .all().length;
}

/**
 * The absolute link a human clicks: the public origin, the SPA page that
 * completes the flow over the API, and the raw token. The origin is
 * configuration (PUBLIC_ORIGIN, required at boot) and never the request's Host
 * header, which an attacker controls.
 */
export function oneTimeLink(
  origin: string,
  path: string,
  token: string,
): string {
  return `${origin}${path}?token=${encodeURIComponent(token)}`;
}
