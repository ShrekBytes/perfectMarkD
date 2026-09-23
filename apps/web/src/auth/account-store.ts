// ─────────────────────────────────────────────────────────────────────────────
// The signed-in account (billing/01): one small store so the shell's account
// menu, the upgrade flow, the quota chip, and anything else billing touches
// agree on who is signed in. The session itself lives in the httpOnly cookie —
// this store only mirrors what GET /api/me reports (server/04 + billing/04):
// the identity, the active Entitlement, the Server Export quota (top-level —
// comps grant allowance without a plan, so quota is account state, not
// entitlement state), and the feature flags the gated Inspector controls read.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import { logout, me, setAiAccess, type MePayload } from './api';
import type { AuthUser } from './api';
import { LOCKED_FLAGS, type FeatureFlags } from './flags';
import type { AiAccountState } from '../ai/types';

/** The active Entitlement, as /api/me reports it; null without one. */
export interface EntitlementState {
  plan: string;
  /** ISO expiry of the Entitlement. */
  expiresAt: string;
}

/** The account store's selector for the feature flags (billing/04). */
export function useFeatureFlags(): FeatureFlags {
  return useAccountStore((state) => state.flags);
}

/**
 * The account store's selector for the AI state (ai-transforms/05). Null
 * signed out; every AI surface reads this block rather than caching its own.
 */
export function useAiState(): AiAccountState | null {
  return useAccountStore((state) => state.ai);
}

interface AccountState {
  user: AuthUser | null;
  entitlement: EntitlementState | null;
  /**
   * Server Export usage vs allowance (plan quota + comps), or null signed
   * out. Top-level, not inside the entitlement: a comped user without a
   * plan (billing/03) has allowance while entitlement is null.
   */
  quota: { used: number; limit: number } | null;
  /** The gated Inspector controls; locked until /api/me says otherwise. */
  flags: FeatureFlags;
  /** The instance's and the caller's AI state; null signed out. */
  ai: AiAccountState | null;
  /**
   * Set when a refresh re-locks a previously-active Entitlement (expiry or
   * revocation) while the user is still signed in — the graceful re-lock's
   * "clear notice": the shell shows it once, and dismissing clears it.
   * Sign-out never sets it (there is nobody to tell).
   */
  planEndedNotice: boolean;
  /** 'loading' until the first check resolves; render nothing until then. */
  status: 'loading' | 'ready';
  /** Checks the session once; safe to call from several mounts. */
  load: () => Promise<void>;
  /**
   * Re-checks the session even after the first load — the refresh the shell
   * and (billing/04) the export flow call when the server state may have
   * moved: after a payment verification, after an export, after sign-in.
   */
  refresh: () => Promise<void>;
  /** Records a just-established session (login/register). */
  signedIn: (user: AuthUser) => void;
  signOut: () => Promise<void>;
  /**
   * Sets the caller's AI Access switch and stores the fresh `ai` block the
   * server returns. Rejects (with the server's message) on failure, so the
   * Account page can show it.
   */
  setAiAccess: (access: boolean) => Promise<void>;
  /** Clears the plan-ended notice once the user has seen it. */
  dismissPlanEndedNotice: () => void;
}

let inflight: Promise<void> | null = null;

function splitMe(payload: MePayload | null): {
  user: AuthUser | null;
  entitlement: EntitlementState | null;
  quota: { used: number; limit: number } | null;
  flags: FeatureFlags;
  ai: AiAccountState | null;
} {
  // The server pairs plan with a non-null expiry whenever an Entitlement is
  // active; anything else (signed out, or signed in without a plan) has no
  // entitlement slice. Flags arrive for every signed-in caller; anyone else
  // — and anyone the payload leaves undescribed — stays locked.
  const entitlement =
    payload?.plan && payload.expiresAt
      ? { plan: payload.plan, expiresAt: payload.expiresAt }
      : null;
  return {
    user: payload ? { email: payload.email, isAdmin: payload.isAdmin } : null,
    entitlement,
    quota: payload?.quota ?? null,
    flags: payload?.flags ?? LOCKED_FLAGS,
    ai: payload?.ai ?? null,
  };
}

export const useAccountStore = create<AccountState>()((set) => {
  const applyMe = (payload: MePayload | null) => {
    const prev = useAccountStore.getState();
    const next = splitMe(payload);
    // Graceful re-lock (billing/04): had an Entitlement, now signed in
    // without one — expiry or an admin revoke. The settings stay put; only
    // the gates close, and the banner explains why.
    const planEndedNotice =
      prev.entitlement !== null &&
      next.entitlement === null &&
      next.user !== null;
    set({ ...next, planEndedNotice, status: 'ready' });
  };

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
    quota: null,
    flags: LOCKED_FLAGS,
    ai: null,
    planEndedNotice: false,
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
      set({
        user: null,
        entitlement: null,
        quota: null,
        flags: LOCKED_FLAGS,
        ai: null,
        planEndedNotice: false,
      });
    },
    setAiAccess: async (access) => {
      set({ ai: await setAiAccess(access) });
    },
    dismissPlanEndedNotice: () => set({ planEndedNotice: false }),
  };
});

export function resetAccountStoreForTests(): void {
  inflight = null;
  useAccountStore.setState({
    user: null,
    entitlement: null,
    quota: null,
    flags: LOCKED_FLAGS,
    ai: null,
    planEndedNotice: false,
    status: 'loading',
  });
}
