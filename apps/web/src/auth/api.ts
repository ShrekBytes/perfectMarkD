// ─────────────────────────────────────────────────────────────────────────────
// Server auth API client (server/02). Same-origin fetches; the session lives
// in an httpOnly cookie, so credentials are always included and no token is
// stored in JS. Errors cross this boundary as AuthError, carrying the server's
// message for display.
// ─────────────────────────────────────────────────────────────────────────────

import { errorFrom, postJson, ApiError } from '../api/client';

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

/** The current session's user, or null when not signed in. */
export async function me(): Promise<AuthUser | null> {
  const res = await fetch('/api/auth/me', { credentials: 'include' });
  if (res.status === 401) return null;
  return readUserOrThrow(res);
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
