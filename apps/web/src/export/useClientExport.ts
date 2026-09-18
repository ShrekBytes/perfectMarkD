// ─────────────────────────────────────────────────────────────────────────────
// The Client Export flow, as a small phase machine:
//
//   idle → building → (first print this session?) → awaiting-hint ─┐
//                        │ no hint needed        │ confirm         │ cancel
//                        ▼                       ▼                 ▼
//                     printing ←───────────── printing            idle
//
// The hint must sit between building and printing because the browser's print
// dialog is modal — anything shown after print() starts is invisible until the
// dialog closes. The "best results in Chrome/Edge" notice rides along: inside
// the hint dialog on first use; on later exports a toast that gets a read
// delay before the dialog opens over it (Firefox/Safari only).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDocumentStore } from '../documents/store';
import {
  buildExportDocument,
  delay,
  hasShownPrintHint,
  markPrintHintShown,
  printQualityBrowser,
  printViaHiddenIframe,
  type PrintQualityBrowser,
} from './clientExport';

export type ExportPhase = 'idle' | 'building' | 'awaiting-hint' | 'printing';

export interface ExportToast {
  kind: 'notice' | 'error';
  text: string;
}

const TOAST_MS = 6000;
const BROWSER_NOTICE = 'Tip: for best print results, use Chrome or Edge.';
const EXPORT_ERROR = 'Client Export failed. Please try again.';

/** How long the browser notice stays readable before the print dialog opens
 *  over it. Tests shrink this via setBrowserNoticeDelayForTests. */
const NOTICE_READ_MS = 2000;
let noticeReadMs = NOTICE_READ_MS;

/** Test hook: keeps the Firefox/Safari notice path from slowing the suite. */
export function setBrowserNoticeDelayForTests(ms: number): void {
  noticeReadMs = ms;
}

export interface ClientExportState {
  /** Store has a document to export. */
  canExport: boolean;
  /** Any in-flight work — disables the split button. */
  busy: boolean;
  /** The build is running — the button shows its busy label. */
  building: boolean;
  /** Chromium is printing — the button keeps its busy label. */
  printing: boolean;
  hintVisible: boolean;
  /** The hint dialog carries the browser notice when it applies. */
  showBrowserNoticeInHint: boolean;
  toast: ExportToast | null;
  runExport(): Promise<void>;
  confirmHint(): Promise<void>;
  cancelHint(): void;
  dismissToast(): void;
}

export function useClientExport(): ClientExportState {
  const canExport = useDocumentStore(
    (state) => state.status === 'ready' && state.activeId !== null,
  );

  const [phase, setPhase] = useState<ExportPhase>('idle');
  const [showBrowserNoticeInHint, setShowBrowserNoticeInHint] = useState(false);
  const [toast, setToast] = useState<ExportToast | null>(null);
  /** Re-entry guard against double-clicks ahead of the re-render. */
  const busyRef = useRef(false);
  /** The built document waiting behind the hint dialog. */
  const pendingHTMLRef = useRef<string | null>(null);
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

  const finish = useCallback(() => {
    busyRef.current = false;
    setPhase('idle');
  }, []);

  const failExport = useCallback(
    (error: unknown) => {
      console.error('Client export failed:', error);
      showToast({ kind: 'error', text: EXPORT_ERROR });
    },
    [showToast],
  );

  const printDocument = useCallback(
    async (html: string) => {
      setPhase('printing');
      try {
        await printViaHiddenIframe(html);
      } catch (error) {
        failExport(error);
      } finally {
        finish();
      }
    },
    [failExport, finish],
  );

  const runExport = useCallback(async () => {
    const store = useDocumentStore.getState();
    if (busyRef.current || store.status !== 'ready' || !store.activeId) return;
    busyRef.current = true;
    setPhase('building');

    let html: string;
    try {
      html = await buildExportDocument(
        store.markdown,
        store.settings,
        store.name || 'Untitled document',
      );
    } catch (error) {
      failExport(error);
      finish();
      return;
    }

    const browser: PrintQualityBrowser | null = printQualityBrowser();
    if (!hasShownPrintHint()) {
      pendingHTMLRef.current = html;
      setShowBrowserNoticeInHint(browser !== null);
      setPhase('awaiting-hint');
      return;
    }

    if (browser) {
      // No dialog this time — give the toast a beat to be read before the
      // print dialog opens over it.
      showToast({ kind: 'notice', text: BROWSER_NOTICE });
      await delay(noticeReadMs);
    }
    await printDocument(html);
  }, [failExport, finish, printDocument, showToast]);

  const confirmHint = useCallback(async () => {
    markPrintHintShown();
    const html = pendingHTMLRef.current;
    pendingHTMLRef.current = null;
    if (!html) {
      finish();
      return;
    }
    // The dialog already carried the browser notice — no toast on top of it.
    await printDocument(html);
  }, [finish, printDocument]);

  const cancelHint = useCallback(() => {
    pendingHTMLRef.current = null;
    finish();
  }, [finish]);

  return {
    canExport,
    busy: phase !== 'idle',
    building: phase === 'building',
    printing: phase === 'printing',
    hintVisible: phase === 'awaiting-hint',
    showBrowserNoticeInHint,
    toast,
    runExport,
    confirmHint,
    cancelHint,
    dismissToast,
  };
}
