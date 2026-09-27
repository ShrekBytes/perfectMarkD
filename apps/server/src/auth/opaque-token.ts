// ─────────────────────────────────────────────────────────────────────────────
// The two halves of an opaque token, defined once: 256 bits of randomness, and
// only the digest stored.
//
// Both users of this are bearer credentials — a session cookie and a one-time
// link in an email — so the two properties that matter (unguessable, and
// useless to anyone holding a copy of the database) must not be re-decided per
// caller. `sessions.ts` and `tokens.ts` are the only two.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash, randomBytes } from 'node:crypto';

/** A fresh 256-bit token, as the caller hands it out. */
export function newOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** What goes in the database: the token's SHA-256, hex. */
export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
