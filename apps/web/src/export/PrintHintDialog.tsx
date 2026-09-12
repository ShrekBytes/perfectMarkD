import { useEffect } from 'react';

interface PrintHintDialogProps {
  showBrowserNotice: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The one-time hint before a session's first Client Export (the ADR-0002
 * print-dialog confusion mitigation). It must be a modal dialog rather than a
 * toast: the browser's print dialog takes over the moment print() is called,
 * so anything the user needs to read has to be on screen before that.
 */
export function PrintHintDialog({
  showBrowserNotice,
  onConfirm,
  onCancel,
}: PrintHintDialogProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onCancel}
        className="animate-fade-in fixed inset-0 z-[60] bg-black/25"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Export via the print dialog"
        data-testid="print-hint-dialog"
        className="animate-fade-in fixed inset-0 z-[70] flex items-center justify-center p-6"
      >
        <div className="w-full max-w-sm rounded-pane border border-hairline bg-surface p-5 shadow-xl">
          <h2 className="text-sm font-semibold">Export via the print dialog</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Your export opens your browser's print dialog. Choose 'Save as PDF'
            in the dialog — quality is identical to a downloaded PDF.
          </p>
          {showBrowserNotice && (
            <p
              data-testid="print-hint-browser-notice"
              className="mt-2 text-xs text-ink-soft"
            >
              Tip: page sizing prints best in Chrome or Edge.
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex h-8 items-center rounded-control border border-hairline px-3 text-sm text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
            >
              Cancel
            </button>
            <button
              type="button"
              autoFocus
              onClick={onConfirm}
              className="flex h-8 items-center rounded-control bg-accent-strong px-3 text-sm font-medium text-accent-ink shadow-sm transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2"
            >
              Continue to print
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
