// ─────────────────────────────────────────────────────────────────────────────
// Test-only helpers for the auth seam, so the suites that need a signed-in
// browser reach it the way a user does: register, follow the emailed link.
//
// A recording Mailer and a public origin are part of every app composition
// (email/02 made both required), so `testMailComposition()` is the two lines
// that replace what used to be nothing at all.
// ─────────────────────────────────────────────────────────────────────────────

import type { AppType } from '../index.js';
import type { GoogleIdentity, GoogleSignIn } from '../google/exchange.js';
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

interface RegisterOptions {
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

/**
 * Google Sign-In for a suite: an exchange that answers one canned identity per
 * authorization code, mounted instead of the real client (google-signin/01).
 * The keys are the codes `signInWithGoogle` will send.
 */
export function fakeGoogleSignIn(
  identities: Record<string, GoogleIdentity>,
): GoogleSignIn {
  return {
    clientId: 'client-id.apps.googleusercontent.com',
    redirectUri: `${TEST_PUBLIC_ORIGIN}/auth/google/callback`,
    exchange: async (code) => {
      const identity = identities[code];
      if (!identity) throw new Error(`no identity for ${code}`);
      return identity;
    },
  };
}

/**
 * The `name=value` pair of one Set-Cookie entry. A response that also clears a
 * cookie sends more than one entry in a single header, so the one wanted has to
 * be picked by name.
 */
function cookiePair(res: Response, name: string): string {
  const entry = res.headers
    .get('set-cookie')
    ?.split(/, (?=[^;]+?=)/)
    .find((one) => one.startsWith(`${name}=`));
  if (!entry) {
    throw new Error(
      `no ${name} cookie in: ${res.headers.get('set-cookie') ?? '(none)'}`,
    );
  }
  return entry.split(';')[0] as string;
}

/**
 * Signs in with Google the way a browser does — the redirect to the consent
 * screen, then the callback with the state cookie it handed out — and returns
 * the session the callback issued. The app must have been composed with
 * `fakeGoogleSignIn`; `code` picks the identity.
 */
export async function signInWithGoogle(
  app: AppType,
  code = 'auth-code',
): Promise<string> {
  const start = await app.request('/auth/google/start');
  const state =
    new URL(start.headers.get('location') ?? '').searchParams.get('state') ??
    '';
  const back = await app.request(
    `/auth/google/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}`,
    { headers: { cookie: cookiePair(start, 'pmd_google_state') } },
  );
  if (back.status !== 302) {
    throw new Error(`google callback failed: ${back.status}`);
  }
  const location = back.headers.get('location') ?? '';
  if (location.includes('google=')) {
    // The flow's own failure redirects: a code the sign-in page would read.
    throw new Error(`google sign-in failed: ${location}`);
  }
  return cookiePair(back, 'pmd_session');
}
