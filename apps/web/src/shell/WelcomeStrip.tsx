import { useDocumentStore } from '../documents/store';
import { CloseIcon } from './icons';

/**
 * First-run welcome strip, pinned above the editor: the active document is
 * the auto-created sample. "Start blank" swaps in a fresh empty document;
 * the × just hides the strip. Both choices mark the sample dismissed
 * (persisted), so it never auto-loads again — the document itself stays in
 * the Library either way.
 */
export function WelcomeStrip() {
  const visible = useDocumentStore((state) =>
    Boolean(
      state.status === 'ready' &&
      state.activeId &&
      state.activeId === state.sampleDocId &&
      !state.sampleDismissed,
    ),
  );
  const dismissSample = useDocumentStore((state) => state.dismissSample);
  const startBlankDocument = useDocumentStore(
    (state) => state.startBlankDocument,
  );

  if (!visible) return null;

  return (
    <div
      role="status"
      data-testid="welcome-strip"
      className="flex shrink-0 items-center gap-2 border-b border-hairline bg-accent-soft px-3 py-1.5 text-sm text-ink"
    >
      <p className="min-w-0 flex-1 truncate">
        This is a sample — edit or clear it.
      </p>
      <button
        type="button"
        data-testid="start-blank"
        onClick={() => void startBlankDocument()}
        className="shrink-0 rounded-control bg-accent px-2.5 py-1 text-xs font-medium text-accent-ink transition-colors duration-150 hover:bg-accent-strong"
      >
        Start blank
      </button>
      <button
        type="button"
        aria-label="Dismiss sample notice"
        title="Dismiss"
        onClick={() => void dismissSample()}
        className="shrink-0 rounded-control p-1 text-ink-faint transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
      >
        <CloseIcon />
      </button>
    </div>
  );
}
