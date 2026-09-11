// ─────────────────────────────────────────────────────────────────────────────
// The signed-in account (billing/01): one small store so the shell's account
// menu, the upgrade flow, the quota chip, and anything else billing touches
// agree on who is signed in. The session itself lives in the httpOnly cookie —
// this store only mirrors what GET /api/me reports (server/04): the identity,
// plus the entitlement slice the quota chip and gated features read.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import { logout, me, type MePayload } from './api';
import type { AuthUser } from './api';

/** The active Entitlement, as /api/me reports it; null without one. */
export interface EntitlementState {
  plan: string;
  /** ISO expiry of the Entitlement. */
  expiresAt: string;
  /** Monthly Server Export stance: used vs the plan quota plus comps. */
  quota: { used: number; limit: number };
}

interface AccountState {
  user: AuthUser | null;
  entitlement: EntitlementState | null;
  /** 'loading' until the first check resolves; render nothing until then. */
  status: 'loading' | 'ready';
  /** Checks the session once; safe to call from several mounts. */
  load: () => Promise<void>;
  /**
   * Re-checks the session even after the first load — the refresh the shell
   * and (billing/04) the upgrade flow call when the server state may have
   * moved: after a payment verification, after an export, after sign-in.
   */
  refresh: () => Promise<void>;
  /** Records a just-established session (login/register). */
  signedIn: (user: AuthUser) => void;
  signOut: () => Promise<void>;
}

let inflight: Promise<void> | null = null;

function splitMe(payload: MePayload | null): {
  user: AuthUser | null;
  entitlement: EntitlementState | null;
} {
  // The server pairs plan with a non-null expiry whenever an Entitlement is
  // active; anything else (signed out, or signed in without a plan) has no
  // entitlement slice.
  const entitlement =
    payload?.plan && payload.expiresAt
      ? {
          plan: payload.plan,
          expiresAt: payload.expiresAt,
          quota: payload.quota,
        }
      : null;
  return {
    user: payload ? { email: payload.email, isAdmin: payload.isAdmin } : null,
    entitlement,
  };
}

export const useAccountStore = create<AccountState>()((set) => {
  const applyMe = (payload: MePayload | null) =>
    set({ ...splitMe(payload), status: 'ready' });

  const recheck = () => {
    // A failed check (offline, server restarting) never breaks the shell:
    // the first load renders signed-out, and a refresh that hiccups keeps
    // whatever was on screen — the next refresh reconciles.
    inflight ??= me()
      .then(applyMe)
      .catch(() => set({ status: 'ready' }))
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };

  return {
    user: null,
    entitlement: null,
    status: 'loading',
    load: () => {
      if (useAccountStore.getState().status === 'ready') {
        return Promise.resolve();
      }
      return recheck();
    },
    refresh: recheck,
    signedIn: (user) => {
      set({ user, status: 'ready' });
      // Login/register carry identity only; the gates need /api/me, so
      // refresh in the background rather than showing a stale quota chip.
      void recheck();
    },
    signOut: async () => {
      // Clear locally even if the request hiccups — a dead network should not
      // trap the user in a session the server has already destroyed.
      await logout().catch(() => undefined);
      set({ user: null, entitlement: null });
    },
  };
});

export function resetAccountStoreForTests(): void {
  inflight = null;
  useAccountStore.setState({
    user: null,
    entitlement: null,
    status: 'loading',
  });
}
