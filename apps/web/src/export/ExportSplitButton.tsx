import { useEffect, useRef, useState } from 'react';
import {
  ChevronDownIcon,
  DownloadIcon,
  PrinterIcon,
  ServerIcon,
  SpinnerIcon,
} from '../shell/icons';
import { PricingModal } from '../pricing/PricingModal';
import { PrintHintDialog } from './PrintHintDialog';
import { useClientExport } from './useClientExport';

/**
 * The top bar's `⬇ Export ▾` split button: the main action is Client Export
 * (ADR-0002's print flow); the dropdown's "Print…" item is the same flow, the
 * dialog being inherent. "Server Export" is the Phase-1 inert entry — it opens
 * the pricing modal (editor-app/09) until the billing workstream swaps in the
 * real flow. The hint dialog, toasts, and pricing modal mount here so the
 * whole flow is one self-contained control the TopBar doesn't need to know
 * about.
 */
export function ExportSplitButton() {
  const flow = useClientExport();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Dropdown dismissal: outside pointer press or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const startExport = () => {
    setMenuOpen(false);
    void flow.runExport();
  };

  const busyButton =
    'transition-colors duration-150 hover:bg-accent-strong disabled:cursor-default disabled:opacity-80';

  return (
    <>
      <div
        ref={containerRef}
        data-testid="export-split"
        aria-busy={flow.building}
        className="relative flex items-stretch rounded-control bg-accent text-accent-ink shadow-sm"
      >
        <button
          type="button"
          onClick={startExport}
          disabled={flow.busy || !flow.canExport}
          title="Export — opens the print dialog (choose 'Save as PDF')"
          className={`flex h-8 items-center gap-1.5 rounded-l-control py-1 pl-3 pr-2 text-sm font-medium ${busyButton}`}
        >
          {flow.building ? (
            <SpinnerIcon className="animate-spin" />
          ) : (
            <DownloadIcon />
          )}
          {flow.building ? 'Exporting…' : 'Export'}
        </button>
        <span aria-hidden="true" className="my-2 w-px bg-accent-ink/30" />
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          disabled={flow.busy || !flow.canExport}
          aria-label="More export options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={`flex h-8 w-6 items-center justify-center rounded-r-control ${busyButton}`}
        >
          <ChevronDownIcon />
        </button>

        {menuOpen && (
          <div
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
              <span className="ml-auto text-xs text-ink-faint">soon</span>
            </button>
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

      {flow.toast && (
        <div
          role="status"
          data-testid="export-toast"
          className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center"
        >
          <div className="animate-fade-in pointer-events-auto flex items-center gap-3 rounded-pane border border-hairline-strong bg-surface px-4 py-2.5 shadow-lg">
            <p
              className={`text-sm ${flow.toast.kind === 'error' ? 'text-danger' : 'text-ink'}`}
            >
              {flow.toast.text}
            </p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={flow.dismissToast}
              className="rounded-control px-1 text-ink-faint transition-colors duration-150 hover:text-ink"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
}
