// ─────────────────────────────────────────────────────────────────────────────
// Server auth API client (server/02). Same-origin fetches; the session lives
// in an httpOnly cookie, so credentials are always included and no token is
// stored in JS. Errors cross this boundary as AuthError, carrying the server's
// message for display.
// ─────────────────────────────────────────────────────────────────────────────

import { errorFrom, postJson, ApiError } from '../api/client';
import type { FeatureFlags } from './flags';

/** The auth client's name for the shared API error. */
export { ApiError as AuthError };

export interface AuthUser {
  email: string;
  isAdmin: boolean;
}

export async function register(
  email: string,
  password: string,
): Promise<AuthUser> {
  return readUserOrThrow(
    await postJson('/api/auth/register', { email, password }),
  );
}

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

/** The GET /api/me payload (server/04 + billing/04): identity, entitlement
 *  gates, and the feature flags the Inspector's gated controls read. */
export interface MePayload {
  email: string;
  isAdmin: boolean;
  /** The active Entitlement's plan; null without one (signed-in Free user). */
  plan: string | null;
  /** ISO expiry of the active Entitlement; null without one. */
  expiresAt: string | null;
  /** Monthly Server Export stance: used vs the plan quota plus comps. */
  quota: { used: number; limit: number };
  /** The gated Inspector controls (billing/04): which gates are open. */
  flags: FeatureFlags;
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

async function readUserOrThrow(res: Response): Promise<AuthUser> {
  if (!res.ok) throw await errorFrom(res);
  const body = (await res.json()) as { user: AuthUser };
  return body.user;
}
