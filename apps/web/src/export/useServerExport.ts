// ─────────────────────────────────────────────────────────────────────────────
// The Server Export flow (billing/04), driving the client in serverExport.ts:
// build the payload → enqueue → poll the job → download the PDF.
//
// The dropdown's Server Export item starts it; the server is the enforcement
// point, so the flow always attempts the export and turns the route's typed
// verdicts into UI: a 402/403 asks for an upgrade (the caller opens the
// pricing modal), anything else surfaces the server's message as a toast. A
// finished export re-checks /api/me so the quota chip reflects the spend.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { useAccountStore } from '../auth/account-store';
import { useDocumentStore } from '../documents/store';
import {
  buildServerExportPayload,
  downloadExportPdf,
  isUpgradePrompt,
  queueServerExport,
  ServerExportError,
  waitForExportJob,
} from './serverExport';
import { useTransientToast, type ExportToast } from './useTransientToast';

const RENDERING_NOTICE = 'Rendering on the server…';
const EXPORT_COMPLETE = 'Server Export complete — the PDF is downloading.';

function exportErrorMessage(error: unknown): string {
  if (error instanceof ServerExportError || error instanceof ApiError) {
    return error.message;
  }
  return 'Server Export failed. Please try again.';
}

/** What runExport reports: ok, failed (with the upgrade-prompt flag), or
 *  null when the run never started (re-entry, no document). */
export type ServerExportOutcome =
  { ok: true } | { ok: false; upgrade: boolean } | null;

export interface ServerExportState {
  /** Any in-flight work — disables the split button. */
  busy: boolean;
  toast: ExportToast | null;
  /** Runs the flow — see ServerExportOutcome. */
  runExport(): Promise<ServerExportOutcome>;
  dismissToast(): void;
}

export function useServerExport(): ServerExportState {
  const [busy, setBusy] = useState(false);
  const { toast, showToast, dismissToast } = useTransientToast();
  /** Re-entry guard against double-clicks ahead of the re-render. */
  const busyRef = useRef(false);

  const runExport = useCallback(async (): Promise<ServerExportOutcome> => {
    const store = useDocumentStore.getState();
    if (busyRef.current || store.status !== 'ready' || !store.activeId) {
      return null;
    }
    busyRef.current = true;
    setBusy(true);

    try {
      const payload = await buildServerExportPayload({
        title: store.name || 'Untitled document',
        markdown: store.markdown,
        settings: store.settings,
      });

      showToast({ kind: 'notice', text: RENDERING_NOTICE });
      const job = await queueServerExport(payload);
      const done = await waitForExportJob(job.id);
      await downloadExportPdf(done, store.name || 'Untitled document');
      showToast({ kind: 'notice', text: EXPORT_COMPLETE });

      // The worker just consumed an export — sync the chip and the gates
      // now rather than waiting for the next natural refresh.
      void useAccountStore.getState().refresh();
      return { ok: true } as const;
    } catch (error) {
      console.error('Server export failed:', error);
      showToast({ kind: 'error', text: exportErrorMessage(error) });
      // 403 (expired or revoked since the last refresh): re-lock now
      // instead of leaving stale gates open; 402: sync the chip.
      if (isUpgradePrompt(error)) {
        void useAccountStore.getState().refresh();
      }
      return { ok: false, upgrade: isUpgradePrompt(error) } as const;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [showToast]);

  return {
    busy,
    toast,
    runExport,
    dismissToast,
  };
}
