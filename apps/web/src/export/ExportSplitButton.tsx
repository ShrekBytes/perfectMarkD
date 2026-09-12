import { useEffect, useRef, useState } from 'react';
import {
  ChevronDownIcon,
  DownloadIcon,
  PrinterIcon,
  ServerIcon,
  SpinnerIcon,
} from '../shell/icons';
import { useAccountStore } from '../auth/account-store';
import { useEscapeLayer, useMenuKeyboard } from '../shell/focus';
import { PricingModal } from '../pricing/PricingModal';
import { PrintHintDialog } from './PrintHintDialog';
import { useClientExport, type ExportToast } from './useClientExport';
import { useServerExport } from './useServerExport';

/**
 * The top bar's `⬇ Export ▾` split button: the main action is Client Export
 * (ADR-0002's print flow); the dropdown's "Print…" item is the same flow, the
 * dialog being inherent. "Server Export" (billing/04) shows the account's
 * quota chip and the Premium queue-priority note for entitled users — or the
 * admin-granted comp allowance — and runs the real enqueue/poll/download
 * flow; a Free or signed-out visitor sees "Paid" and the pricing modal, whose
 * Upgrade CTAs run the real upgrade flow (billing/01). Gate rejections come
 * back typed from the server and open that same modal as the upgrade prompt.
 * The hint dialog, toasts, and pricing modal mount here so the whole flow is
 * one self-contained control the TopBar doesn't need to know about.
 */

/** The dropdown item's queue-priority note per entitlement state. */
function priorityNote(plan: string | null): string {
  return plan === 'premium'
    ? 'Priority render queue'
    : plan === 'pro'
      ? 'Premium renders first'
      : 'Admin-granted exports';
}

export function ExportSplitButton() {
  const flow = useClientExport();
  const server = useServerExport();
  const entitlement = useAccountStore((state) => state.entitlement);
  const quota = useAccountStore((state) => state.quota);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Dropdown dismissal on outside pointer press.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  // Escape resolves the topmost layer only and returns focus to the trigger;
  // the menu itself roves with the arrow keys (focus.ts).
  useEscapeLayer(menuOpen, () => {
    setMenuOpen(false);
    triggerRef.current?.focus();
  });
  useMenuKeyboard(menuRef, menuOpen, () => setMenuOpen(false));

  const busy = flow.busy || server.busy;

  const startExport = () => {
    setMenuOpen(false);
    void flow.runExport();
  };

  /** Entitled users export against their plan quota; a comped user without
   *  an active plan (billing/03) spends their allowance the same way. */
  const canServerExport =
    entitlement !== null || (quota !== null && quota.limit > 0);

  const startServerExport = () => {
    setMenuOpen(false);
    void server.runExport().then((outcome) => {
      // The server's typed gate rejection is the upgrade prompt's trigger:
      // over-quota (402) and entitlement-required (403) both land here.
      if (outcome?.ok === false && outcome.upgrade) setPricingOpen(true);
    });
  };

  const busyButton =
    'transition-colors duration-150 hover:bg-accent-deep disabled:cursor-default disabled:opacity-80';

  const toast = flow.toast ?? server.toast;

  return (
    <>
      <div
        ref={containerRef}
        data-testid="export-split"
        aria-busy={busy}
        className="relative flex items-stretch rounded-control bg-accent-strong text-accent-ink shadow-sm"
      >
        <button
          type="button"
          onClick={startExport}
          disabled={busy || !flow.canExport}
          title="Export — opens the print dialog (choose 'Save as PDF')"
          className={`flex h-8 items-center gap-1.5 rounded-l-control py-1 pl-3 pr-2 text-sm font-medium ${busyButton}`}
        >
          {busy ? <SpinnerIcon className="animate-spin" /> : <DownloadIcon />}
          {busy ? 'Exporting…' : 'Export'}
        </button>
        <span aria-hidden="true" className="my-2 w-px bg-accent-ink/30" />
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          disabled={busy || !flow.canExport}
          aria-label="More export options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={`flex h-8 w-6 items-center justify-center rounded-r-control ${busyButton}`}
        >
          <ChevronDownIcon />
        </button>

        {menuOpen && (
          <div
            ref={menuRef}
            role="menu"
            aria-label="Export options"
            className="absolute right-0 top-full z-50 mt-1.5 overflow-hidden rounded-pane border border-hairline bg-surface py-1 shadow-lg"
          >
            <button
              role="menuitem"
              type="button"
              onClick={startExport}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink transition-colors duration-150 hover:bg-surface-hover"
            >
              <PrinterIcon className="text-ink-soft" />
              Print…
            </button>
            {canServerExport && quota ? (
              <button
                role="menuitem"
                type="button"
                onClick={startServerExport}
                title={
                  entitlement
                    ? 'Renders on the server with headless Chromium'
                    : 'Renders on the server — your admin-granted allowance'
                }
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-ink transition-colors duration-150 hover:bg-surface-hover"
              >
                <ServerIcon className="mt-0.5 shrink-0 text-ink-soft" />
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2">
                    Server Export
                    <span
                      data-testid="server-export-quota"
                      className={`ml-auto rounded-control border px-1.5 text-[11px] tabular-nums ${
                        quota.used >= quota.limit
                          ? 'border-danger/40 text-danger'
                          : 'border-hairline text-ink-soft'
                      }`}
                    >
                      {quota.used}/{quota.limit}
                    </span>
                  </span>
                  <span className="text-[11px] font-normal text-ink-faint">
                    {priorityNote(entitlement?.plan ?? null)}
                  </span>
                </span>
              </button>
            ) : (
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setPricingOpen(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink transition-colors duration-150 hover:bg-surface-hover"
              >
                <ServerIcon className="text-ink-soft" />
                Server Export
                <span className="ml-auto text-xs text-ink-faint">Paid</span>
              </button>
            )}
          </div>
        )}
      </div>

      {flow.hintVisible && (
        <PrintHintDialog
          showBrowserNotice={flow.showBrowserNoticeInHint}
          onConfirm={() => void flow.confirmHint()}
          onCancel={flow.cancelHint}
        />
      )}

      {pricingOpen && <PricingModal onClose={() => setPricingOpen(false)} />}

      {toast && (
        <ExportToastView
          toast={toast}
          dismissToast={flow.toast ? flow.dismissToast : server.dismissToast}
        />
      )}
    </>
  );
}

/** The export toast — one self-contained block either flow borrows. */
function ExportToastView({
  toast,
  dismissToast,
}: {
  toast: ExportToast;
  dismissToast: () => void;
}) {
  return (
    <div
      role="status"
      data-testid="export-toast"
      className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center"
    >
      <div className="animate-fade-in pointer-events-auto flex items-center gap-3 rounded-pane border border-hairline-strong bg-surface px-4 py-2.5 shadow-lg">
        <p
          className={`text-sm ${toast.kind === 'error' ? 'text-danger' : 'text-ink'}`}
        >
          {toast.text}
        </p>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismissToast}
          className="rounded-control px-1 text-ink-faint transition-colors duration-150 hover:text-ink"
        >
          ×
        </button>
      </div>
    </div>
  );
}
