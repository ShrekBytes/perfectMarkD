import { useDocumentStore } from '../documents/store';
import { BannerButton, BannerStrip } from './BannerStrip';

/**
 * Shell-level notice under the top bar: another tab changed the active
 * document while this tab held unflushed edits. The weights follow the
 * danger: "Keep mine" is the filled primary — it keeps this tab's edits and
 * the next autosave overwrites the peer's version (last-writer-wins) — while
 * "Load changes" is a danger ghost because it discards local edits. No
 * dismiss: a version conflict is resolved, never cleared.
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
    <BannerStrip
      testid="stale-banner"
      role="alert"
      copy="This document changed in another tab. Loading the changes discards your unsaved edits — keeping yours overwrites the other version at the next save."
    >
      <BannerButton variant="primary" onClick={dismissRemoteVersion}>
        Keep mine
      </BannerButton>
      <BannerButton variant="danger" onClick={() => void loadRemoteVersion()}>
        Load changes
      </BannerButton>
    </BannerStrip>
  );
}
