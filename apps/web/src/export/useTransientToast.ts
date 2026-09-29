// ─────────────────────────────────────────────────────────────────────────────
// The export toast's plumbing, shared by both export flows (the Client Export
// print flow and the Server Export queue flow): one toast at a time, six
// seconds on its own, a manual dismissal, and the timer cleaned up on
// unmount — the split button renders whatever either flow last said.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ExportToast {
  kind: 'notice' | 'error';
  text: string;
}

const TOAST_MS = 6000;

/** One transient toast: `showToast` replaces whatever is up (and restarts
 *  the clock), `dismissToast` clears it now, and unmount drops the timer. */
export function useTransientToast() {
  const [toast, setToast] = useState<ExportToast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const showToast = useCallback((next: ExportToast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  return { toast, showToast, dismissToast };
}
