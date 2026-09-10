import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, ne } from 'drizzle-orm';
import type { AppDatabase } from '../db/database.js';
import { sessions, users, type User } from '../db/schema.js';

export const SESSION_COOKIE = 'pmd_session';
/** Rolling 30-day session lifetime (spec §Security posture). */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Refresh the stored expiry at most this often, to avoid a write per request. */
const SESSION_ROLL_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/** Injectable clock — real time in production, controlled in tests. */
export type Clock = () => Date;

/**
 * Tokens are opaque 256-bit random values. Only the SHA-256 digest is stored,
 * so a database leak can't be replayed as a live session.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Issues a session for `userId` and returns the raw token for the cookie. */
export function createSession(
  db: AppDatabase,
  userId: number,
  now: Date = new Date(),
): string {
  const token = generateToken();
  db.insert(sessions)
    .values({
      token: hashToken(token),
      userId,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    })
    .run();
  return token;
}

/** The resolved session user plus whether its expiry was rolled forward. */
export interface ResolvedSession {
  user: User;
  /** True when the stored expiry was extended (callers re-issue the cookie). */
  rolled: boolean;
}

/**
 * Resolves a raw token to its user, or null when unknown/expired. A valid
 * session is *rolled*: its expiry moves to 30 days from now, so an active user
 * is never signed out. The write only happens once per day (threshold) to keep
 * the common read path read-only.
 */
export function userForSessionToken(
  db: AppDatabase,
  token: string,
  now: Date = new Date(),
): ResolvedSession | null {
  const digest = hashToken(token);
  const row = db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.token, digest), gt(sessions.expiresAt, now)))
    .get();
  if (!row) return null;

  const rolledExpiry = new Date(now.getTime() + SESSION_TTL_MS);
  const rolled =
    rolledExpiry.getTime() - row.expiresAt.getTime() >
    SESSION_ROLL_THRESHOLD_MS;
  if (rolled) {
    db.update(sessions)
      .set({ expiresAt: rolledExpiry })
      .where(eq(sessions.token, digest))
      .run();
  }
  return { user: row.user, rolled };
}

/** Revokes a single session (logout). Unknown tokens are a no-op. */
export function deleteSession(db: AppDatabase, token: string): void {
  db.delete(sessions)
    .where(eq(sessions.token, hashToken(token)))
    .run();
}

/**
 * Revokes every session for `userId` except the one identified by `keepToken`
 * (used after a password change: other devices are signed out, the device that
 * made the change stays signed in).
 */
export function deleteOtherSessions(
  db: AppDatabase,
  userId: number,
  keepToken: string,
): void {
  db.delete(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        ne(sessions.token, hashToken(keepToken)),
      ),
    )
    .run();
}
