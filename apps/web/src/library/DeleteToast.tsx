import { useDocumentStore } from '../documents/store';
import { Toast } from '../shell/Toast';
import { useToastTimer } from '../shell/useTransientToast';

/**
 * Bottom-center toast for the last deletion, with an Undo action. The
 * deletion becomes permanent when the toast times out, is dismissed, or a
 * newer deletion replaces it. Sits above the zoom pill's resting place.
 *
 * The message and the dismissal live in the document store, not here, so the
 * store owns what is deleted; the clock is the shell's, shared with every
 * other toast.
 */
export function DeleteToast() {
  const deleteToast = useDocumentStore((state) => state.deleteToast);
  const undoDelete = useDocumentStore((state) => state.undoDelete);
  const dismissDeleteToast = useDocumentStore(
    (state) => state.dismissDeleteToast,
  );

  useToastTimer(deleteToast, dismissDeleteToast);

  if (!deleteToast) return null;

  return (
    <Toast
      testId="delete-toast"
      onDismiss={dismissDeleteToast}
      message={
        <>
          Deleted <span className="font-medium">{deleteToast.doc.name}</span>
        </>
      }
      action={
        <button
          type="button"
          onClick={() => void undoDelete()}
          className="touch-target rounded-control px-2 py-1 text-sm font-medium text-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover focus-visible:outline-2"
        >
          Undo
        </button>
      }
    />
  );
}
