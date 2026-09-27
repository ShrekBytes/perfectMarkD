// ─────────────────────────────────────────────────────────────────────────────
// Test-only helpers for the auth seam, so the suites that need a signed-in
// browser reach it the way a user does: register, follow the emailed link.
//
// A recording Mailer and a public origin are part of every app composition
// (email/02 made both required), so `testMailComposition()` is the two lines
// that replace what used to be nothing at all.
// ─────────────────────────────────────────────────────────────────────────────

import type { AppType } from '../index.js';
import {
  createRecordingMailer,
  type RecordingMailer,
} from '../mail/testing.js';

/** The origin test one-time links are built from; asserted, never resolved. */
export const TEST_PUBLIC_ORIGIN = 'https://app.test';

/** The mail half of every app composition, ready to spread into createApp. */
export function testMailComposition(): {
  mail: RecordingMailer;
  publicOrigin: string;
} {
  return { mail: createRecordingMailer(), publicOrigin: TEST_PUBLIC_ORIGIN };
}

export interface RegisterOptions {
  email?: string;
  password?: string;
}

/**
 * Registers, follows the link the fake Mailer recorded, and returns the
 * `pmd_session` cookie. Registration no longer starts a session (email/02), so
 * this is the shortest honest path to "signed in" for a suite about something
 * else.
 */
export async function registerAndVerify(
  app: AppType,
  mailer: RecordingMailer,
  {
    email = 'reader@example.com',
    password = 'correct horse battery',
  }: RegisterOptions = {},
): Promise<string> {
  const registered = await app.request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (registered.status !== 201) {
    throw new Error(`registration failed: ${registered.status}`);
  }
  const verified = await app.request('/api/auth/verify-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: mailer.tokenTo(email) }),
  });
  const header = verified.headers.get('set-cookie');
  if (!header) throw new Error('verification started no session');
  return header.split(';')[0] as string;
}
