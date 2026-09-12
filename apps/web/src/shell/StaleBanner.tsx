import { useDocumentStore } from '../documents/store';

/**
 * Full-width notice under the top bar: another tab changed the active
 * document while this tab held unflushed edits. "Load changes" adopts the
 * peer's version (discarding local edits); "Keep mine" lets the next
 * autosave overwrite it (last-writer-wins).
 */
export function StaleBanner() {
  const remotePending = useDocumentStore((state) => state.remotePending);
  const loadRemoteVersion = useDocumentStore(
    (state) => state.loadRemoteVersion,
  );
  const dismissRemoteVersion = useDocumentStore(
    (state) => state.dismissRemoteVersion,
  );

  if (!remotePending) return null;

  return (
    <div
      role="alert"
      data-testid="stale-banner"
      className="flex h-10 shrink-0 items-center gap-3 border-b border-hairline bg-accent-soft px-3 text-sm text-ink"
    >
      <p className="min-w-0 truncate">
        This document was changed in another tab. Your copy may be out of date.
      </p>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => void loadRemoteVersion()}
          className="flex h-7 items-center rounded-control bg-accent-strong px-2.5 text-sm font-medium text-accent-ink transition-colors duration-150 hover:bg-accent-deep"
        >
          Load changes
        </button>
        <button
          type="button"
          onClick={dismissRemoteVersion}
          className="flex h-7 items-center rounded-control border border-hairline px-2.5 text-sm text-ink-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
        >
          Keep mine
        </button>
      </div>
    </div>
  );
}
