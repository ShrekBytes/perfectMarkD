// ─────────────────────────────────────────────────────────────────────────────
// The toast's clock, shared by every surface that shows one (the export flows'
// notices and failures, the rejected-drop notice, the undoable delete): one
// number for how long a toast leaves on its own, the clock restarted whenever
// a newer message arrives, and the timer cleared on unmount.
//
// It lives beside `Toast` rather than inside the export flow because it is no
// longer the export flow's own — it is the toast's, and the toast is shell
// chrome. Two shapes of consumer: `useTransientToast` owns the message as well
// as the clock (a flow that raises its own toasts), and `useToastTimer` is the
// clock alone (a surface whose message already lives in a store).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';

export interface ToastMessage {
  kind: 'notice' | 'error';
  text: string;
}

/**
 * How long a toast stays before it leaves on its own. One number for all of
 * them, and it is set by the longest case in the set: the undoable delete is the
 * one toast whose expiry ends anything, so the window it asks for is the window
 * every toast gets. The two informational toasts wait out that extra second,
 * which costs them nothing.
 */
const TOAST_MS = 7000;

/**
 * The shared clock: while `message` is not null, `dismiss` is called once,
 * TOAST_MS later. A new message restarts the window (a later message should
 * get its own full read), and unmount drops the timer so a dismissal never
 * lands on a component that is gone.
 */
export function useToastTimer<T>(message: T | null, dismiss: () => void): void {
  useEffect(() => {
    if (message === null) return;
    const timer = setTimeout(dismiss, TOAST_MS);
    return () => clearTimeout(timer);
  }, [message, dismiss]);
}

/** One transient toast: `showToast` replaces whatever is up (and restarts
 *  the clock), `dismissToast` clears it now, and unmount drops the timer. */
export function useTransientToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((next: ToastMessage) => {
    setToast(next);
  }, []);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  useToastTimer(toast, dismissToast);

  return { toast, showToast, dismissToast };
}
