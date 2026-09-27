// ─────────────────────────────────────────────────────────────────────────────
// Server auth API client (server/02). Same-origin fetches; the session lives
// in an httpOnly cookie, so credentials are always included and no token is
// stored in JS. Errors cross this boundary as AuthError, carrying the server's
// message for display.
// ─────────────────────────────────────────────────────────────────────────────

import { errorFrom, postJson, putJson, ApiError } from '../api/client';
import type { FeatureFlags } from './flags';
import type { AiAccountState } from '../ai/types';

/** The auth client's name for the shared API error. */
export { ApiError as AuthError };

export interface AuthUser {
  email: string;
  isAdmin: boolean;
}

/**
 * What registration returns: the address the verification link went to. There
 * is no user and no session — the account cannot be used until the link is
 * followed (email/02), so all the form knows is which inbox to wait for.
 */
export interface RegistrationSent {
  email: string;
}

export async function register(
  email: string,
  password: string,
): Promise<RegistrationSent> {
  const res = await postJson('/api/auth/register', { email, password });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as RegistrationSent;
}

/**
 * Asks for a fresh verification link. Success-shaped for every address, so
 * this is safe to call with anything the user typed.
 */
export async function resendVerification(email: string): Promise<void> {
  const res = await postJson('/api/auth/resend-verification', { email });
  if (!res.ok) throw await errorFrom(res);
}

/** Spends a one-time link from a verification email, verifying the address and
 *  signing the user in at once. */
export async function verifyEmail(token: string): Promise<AuthUser> {
  return readUserOrThrow(await postJson('/api/auth/verify-email', { token }));
}

/** The sign-in gate's code: the account exists but its address is unverified. */
export const EMAIL_UNVERIFIED_CODE = 'email_unverified';

/**
 * The dead-link code: the token was unknown, expired, already spent, or issued
 * for another flow — one answer for all four, because the recovery is the same
 * and telling them apart would say something about the account to whoever holds
 * a dead link.
 */
export const LINK_INVALID_CODE = 'link_invalid';

export async function login(
  email: string,
  password: string,
): Promise<AuthUser> {
  return readUserOrThrow(
    await postJson('/api/auth/login', { email, password }),
  );
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
}

/**
 * How the account signs in (google-signin/01b): a password of its own, a Google
 * identity, or both. The Account page renders the form this reports and never
 * guesses which of the two an account has.
 */
export interface SignInMethods {
  password: boolean;
  google: boolean;
}

/** The GET /api/me payload (server/04 + billing/04): identity, entitlement
 *  gates, the sign-in methods (google-signin/01b), and the feature flags the
 *  Inspector's gated controls read. */
export interface MePayload {
  email: string;
  isAdmin: boolean;
  /** The active Entitlement's plan; null without one (signed-in Free user). */
  plan: string | null;
  /** ISO expiry of the active Entitlement; null without one. */
  expiresAt: string | null;
  /** Monthly Server Export stance: used vs the plan quota plus comps. */
  quota: { used: number; limit: number };
  /** This account's sign-in methods, as the server reports them. */
  signIn: SignInMethods;
  /** The gated Inspector controls (billing/04): which gates are open. */
  flags: FeatureFlags;
  /** The instance's and the caller's AI state (ai-transforms/05). */
  ai: AiAccountState;
}

/**
 * The session's identity and gates, or null when not signed in. The single
 * source of truth for the quota chip (server/04) and the gated Inspector
 * controls (billing/04's flags).
 */
export async function me(): Promise<MePayload | null> {
  const res = await fetch('/api/me', { credentials: 'include' });
  if (res.status === 401) return null;
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as MePayload;
}

/**
 * Asks for a Password Reset link. Success-shaped for every address, so this is
 * safe to call with anything the user typed: the page cannot tell a registered
 * address from an unknown one, and must not appear to.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const res = await postJson('/api/auth/request-password-reset', { email });
  if (!res.ok) throw await errorFrom(res);
}

/**
 * Chooses a new password with a live reset link. The token travels in the
 * request body, never the URL: the link's page holds it in memory and spends it
 * here, so an inbox link scanner that follows the URL cannot set a password.
 * Throws AuthError with `link_invalid` when the link is dead, which the page
 * answers with a fresh-link route.
 */
export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<void> {
  const res = await postJson('/api/auth/reset-password', {
    token,
    newPassword,
  });
  if (!res.ok) throw await errorFrom(res);
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const res = await postJson('/api/auth/change-password', {
    currentPassword,
    newPassword,
  });
  if (!res.ok) throw await errorFrom(res);
}

/**
 * Sets the *first* password on an account that has none (google-signin/01b) —
 * Set Password, from the Account page while signed in. The session is the whole
 * check, so there is no current password to send; a 409 is an account that
 * already has one, which belongs in Change Password.
 */
export async function setPassword(newPassword: string): Promise<void> {
  const res = await postJson('/api/auth/set-password', { newPassword });
  if (!res.ok) throw await errorFrom(res);
}

/**
 * What sign-in methods this instance offers (google-signin/01). `google` is
 * false on a deployment with no OAuth client, which is how the button on the
 * sign-in page stays absent rather than broken. Public: the page nobody is
 * signed in to yet is the one that asks.
 */
export interface SignInProviders {
  google: boolean;
}

export async function signInProviders(): Promise<SignInProviders> {
  const res = await fetch('/api/auth/providers', { credentials: 'include' });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as SignInProviders;
}

/**
 * The email-changed code: the new address belongs to another account. Only the
 * swap can know it — the request never refuses an address that is registered,
 * so the Account page cannot be used to discover whose addresses those are.
 */
export const EMAIL_TAKEN_CODE = 'email_taken';

/**
 * Asks for an email-change link. The current password is the gate: the server
 * checks it before it mails anything, so a stolen session cannot redirect the
 * account. Nothing changes until the link is opened, and the address comes back
 * as the server stored it (normalized), so the form can name the right inbox.
 */
export async function requestEmailChange(
  email: string,
  currentPassword: string,
): Promise<string> {
  const res = await postJson('/api/auth/change-email', {
    email,
    currentPassword,
  });
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { email: string }).email;
}

/**
 * Spends the emailed link: the account's login address is swapped onto the one
 * the link was mailed to, and that address is verified by the opening. The
 * user comes back with the identity the swap produced.
 */
export async function confirmEmailChange(token: string): Promise<AuthUser> {
  return readUserOrThrow(
    await postJson('/api/auth/confirm-email-change', { token }),
  );
}

/**
 * Sets the caller's AI Access switch (spec §AI Access) and returns the fresh
 * `ai` block. The switch is server-side, so it follows the account.
 */
export async function setAiAccess(access: boolean): Promise<AiAccountState> {
  const res = await putJson('/api/ai/access', { access });
  if (!res.ok) throw await errorFrom(res);
  const body = (await res.json()) as { ai: AiAccountState };
  return body.ai;
}

async function readUserOrThrow(res: Response): Promise<AuthUser> {
  if (!res.ok) throw await errorFrom(res);
  const body = (await res.json()) as { user: AuthUser };
  return body.user;
}
