import { useDocumentStore } from '../documents/store';
import { BannerButton, BannerStrip } from './BannerStrip';

/**
 * First-run welcome strip, mounted at shell level with the other notices:
 * the active document is the auto-created sample. "Start blank" swaps in a
 * fresh empty document; the × just hides the strip. Both choices mark the
 * sample dismissed (persisted), so it never auto-loads again — the document
 * itself stays in the Library either way.
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
    <BannerStrip
      testid="welcome-strip"
      role="status"
      copy="This is a sample — edit or clear it."
      onDismiss={() => void dismissSample()}
      dismissLabel="Dismiss sample notice"
    >
      {/* Ghost, not primary: the top-bar Export split button is the only
          violet fill (DESIGN.md Reserved Violet Rule). */}
      <BannerButton
        variant="ghost"
        testid="start-blank"
        onClick={() => void startBlankDocument()}
      >
        Start blank
      </BannerButton>
    </BannerStrip>
  );
}
