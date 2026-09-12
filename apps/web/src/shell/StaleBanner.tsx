import { useDocumentStore } from '../documents/store';

/**
 * Full-width notice under the top bar: another tab changed the active
 * document while this tab held unflushed edits. The weights follow the
 * danger: "Keep mine" is the filled primary — it keeps this tab's edits and
 * the next autosave overwrites the peer's version (last-writer-wins) — while
 * "Load changes" is a ghost with danger text because it discards local
 * edits. The copy wraps instead of truncating: both consequences must stay
 * readable at any width, so the strip grows past its 40px resting height.
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
      className="flex min-h-10 shrink-0 items-center gap-3 border-b border-hairline bg-accent-soft px-3 py-1.5 text-sm text-ink"
    >
      <p className="min-w-0">
        This document changed in another tab. Loading the changes discards your
        unsaved edits — keeping yours overwrites the other version at the next
        save.
      </p>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={dismissRemoteVersion}
          className="flex h-7 items-center rounded-control bg-accent-strong px-2.5 text-sm font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2"
        >
          Keep mine
        </button>
        <button
          type="button"
          onClick={() => void loadRemoteVersion()}
          className="flex h-7 items-center rounded-control border border-danger/40 px-2.5 text-sm text-danger transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover focus-visible:outline-2"
        >
          Load changes
        </button>
      </div>
    </div>
  );
}
