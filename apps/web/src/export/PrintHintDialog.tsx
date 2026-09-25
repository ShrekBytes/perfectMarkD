import { Dialog } from '../shell/Dialog';

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
 *
 * It rides the shell's shared Dialog (one backdrop, one focus trap, one
 * Escape layer) so the export flow cannot drift from the pricing and history
 * dialogs it sits beside.
 */
export function PrintHintDialog({
  showBrowserNotice,
  onConfirm,
  onCancel,
}: PrintHintDialogProps) {
  return (
    <Dialog
      label="Export via the print dialog"
      testId="print-hint-dialog"
      backdropTestId="print-hint-backdrop"
      panelClassName="w-full max-w-sm"
      onClose={onCancel}
    >
      <p className="text-sm text-ink-soft">
        This opens your browser's print dialog. Choose 'Save as PDF' — quality
        is identical to a downloaded PDF.
      </p>
      {/* Phones: the mobile print experience is a different dance, and this
          dialog is the only moment to teach it — the browser's own UI takes
          over next. Gate on the coarse-pointer signal, not the viewport. */}
      <p className="hidden text-xs text-ink-soft hover-none:mt-2 hover-none:block">
        On a phone the print dialog fills the screen: pick 'Save as PDF' as the
        destination (Android), or on iPhone tap Share in the print preview and
        choose 'Save to Files'.
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
          className="touch-target flex h-8 items-center rounded-control border border-hairline px-3 text-sm text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
        >
          Cancel export
        </button>
        <button
          type="button"
          autoFocus
          onClick={onConfirm}
          className="touch-target flex h-8 items-center rounded-control bg-accent-strong px-3 text-sm font-medium text-accent-ink shadow-sm transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2"
        >
          Continue to print
        </button>
      </div>
    </Dialog>
  );
}
