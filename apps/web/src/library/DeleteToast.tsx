import { useEffect } from 'react';
import { useDocumentStore } from '../documents/store';
import { CloseIcon } from '../shell/icons';

/** How long the undoable delete toast stays before the deletion is final. */
export const DELETE_TOAST_MS = 7000;

/**
 * Bottom-center toast for the last deletion, with an Undo action. The
 * deletion becomes permanent when the toast times out, is dismissed, or a
 * newer deletion replaces it. Sits above the zoom pill's resting place.
 */
export function DeleteToast() {
  const deleteToast = useDocumentStore((state) => state.deleteToast);
  const undoDelete = useDocumentStore((state) => state.undoDelete);
  const dismissDeleteToast = useDocumentStore(
    (state) => state.dismissDeleteToast,
  );

  useEffect(() => {
    if (!deleteToast) return;
    const timer = setTimeout(dismissDeleteToast, DELETE_TOAST_MS);
    return () => clearTimeout(timer);
  }, [deleteToast, dismissDeleteToast]);

  if (!deleteToast) return null;

  return (
    <div
      role="status"
      data-testid="delete-toast"
      className="fixed inset-x-0 bottom-16 z-[60] flex justify-center pointer-events-none"
    >
      <div className="animate-fade-in pointer-events-auto flex items-center gap-3 rounded-pane border border-hairline-strong bg-surface px-4 py-2.5 shadow-lg">
        <p className="text-sm text-ink">
          Deleted <span className="font-medium">{deleteToast.doc.name}</span>
        </p>
        <button
          type="button"
          onClick={() => void undoDelete()}
          className="rounded-control px-2 py-1 text-sm font-medium text-accent transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-soft focus-visible:outline-2"
        >
          Undo
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismissDeleteToast}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-ink-faint transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
