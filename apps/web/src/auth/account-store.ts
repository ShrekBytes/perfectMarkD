// ─────────────────────────────────────────────────────────────────────────────
// The signed-in account (billing/01): one small store so the shell's account
// menu, the upgrade flow, and anything else billing touches agree on who is
// signed in. The session itself lives in the httpOnly cookie — this store only
// mirrors what /api/auth/me reports.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import { logout, me, type AuthUser } from './api';

interface AccountState {
  user: AuthUser | null;
  /** 'loading' until the first `load()` resolves; render nothing until then. */
  status: 'loading' | 'ready';
  /** Checks the session once; safe to call from several mounts. */
  load: () => Promise<void>;
  /** Records a just-established session (login/register). */
  signedIn: (user: AuthUser) => void;
  signOut: () => Promise<void>;
}

let inflight: Promise<void> | null = null;

export const useAccountStore = create<AccountState>()((set) => ({
  user: null,
  status: 'loading',
  load: () => {
    if (useAccountStore.getState().status === 'ready') return Promise.resolve();
    // A failed check (offline, server restarting) means "not signed in",
    // never a broken shell — the menu re-checks on the next mount.
    inflight ??= me()
      .then((user) => set({ user, status: 'ready' }))
      .catch(() => set({ user: null, status: 'ready' }))
      .finally(() => {
        inflight = null;
      });
    return inflight;
  },
  signedIn: (user) => set({ user, status: 'ready' }),
  signOut: async () => {
    // Clear locally even if the request hiccups — a dead network should not
    // trap the user in a session the server has already destroyed.
    await logout().catch(() => undefined);
    set({ user: null });
  },
}));

export function resetAccountStoreForTests(): void {
  inflight = null;
  useAccountStore.setState({ user: null, status: 'loading' });
}
