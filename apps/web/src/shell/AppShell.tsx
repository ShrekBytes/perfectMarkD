import { useCallback, useEffect, useRef, useState } from 'react';
import { TopBar } from './TopBar';
import { StaleBanner } from './StaleBanner';
import { CollapsedPaneToggle, PaneDivider } from './PaneDivider';
import { WelcomeStrip } from './WelcomeStrip';
import { UploadIcon } from './icons';
import { PANE_LIMITS, usePaneLayout } from './pane-layout';
import { useTheme } from '../theme/theme';
import { useDocumentStore } from '../documents/store';
import { useAccountStore } from '../auth/account-store';
import { UpgradeStatusDialog } from '../billing/UpgradeStatusDialog';
import { HistoryDialog } from '../history/HistoryDialog';
import { EditorPane } from '../editor/EditorPane';
import { DeleteToast } from '../library/DeleteToast';
import { LibraryPanel } from '../library/LibraryPanel';
import { useFileDrop } from '../library/useFileDrop';
import { PaperCanvas, type PaperCanvasApi } from '../canvas/PaperCanvas';
import { Inspector } from '../inspector/Inspector';

/**
 * The app shell: top bar + three panes (editor · Paper Canvas · inspector).
 * Panes collapse via their divider toggles; with both collapsed the shell is in
 * fullscreen-canvas mode. Document state lives in the document store; the
 * Library drawer, delete-undo toast, staleness banner, and .md drag-drop
 * import mount here.
 */
export function AppShell() {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const pane = usePaneLayout(containerRef);
  const { theme, toggle } = useTheme();

  const docName = useDocumentStore((state) =>
    state.activeId ? state.name : 'Untitled document',
  );
  const saveState = useDocumentStore((state) =>
    state.activeId ? state.saveState : null,
  );
  const ready = useDocumentStore((state) => state.status === 'ready');
  const docCount = useDocumentStore((state) => state.docs.length);
  const renameDocument = useDocumentStore((state) => state.renameDocument);
  const importDocument = useDocumentStore((state) => state.importDocument);

  const [libraryOpen, setLibraryOpen] = useState(false);
  const [upgradeStatusOpen, setUpgradeStatusOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  /** The canvas exposes its API through this ref so the editor's Ctrl/Cmd+Enter
   *  and scroll events reach it without threading through re-renders. */
  const canvasApiRef = useRef<PaperCanvasApi | null>(null);

  useEffect(() => {
    void useDocumentStore.getState().init();
    // The account menu (billing/01) needs to know who is signed in.
    void useAccountStore.getState().load();
  }, []);

  // With no documents at all there is nothing to open — land the user in the
  // Library (the second-run "or Library if none" case).
  useEffect(() => {
    if (ready && docCount === 0) setLibraryOpen(true);
  }, [ready, docCount]);

  const importFiles = useCallback(
    (files: File[]) => {
      void (async () => {
        for (const file of files) {
          await importDocument(file.name, await file.text());
        }
      })();
    },
    [importDocument],
  );
  const draggingFiles = useFileDrop(importFiles);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas text-ink">
      <TopBar
        docName={docName}
        onRename={(name) => {
          const activeId = useDocumentStore.getState().activeId;
          if (activeId) void renameDocument(activeId, name);
        }}
        saveState={saveState}
        libraryOpen={libraryOpen}
        onOpenLibrary={() => setLibraryOpen(true)}
        theme={theme}
        onToggleTheme={toggle}
        onOpenUpgradeStatus={() => setUpgradeStatusOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
      />

      <StaleBanner />

      <div
        ref={containerRef}
        data-testid="shell-content"
        data-fullscreen={pane.fullscreen ? '' : undefined}
        className="relative flex min-h-0 flex-1"
      >
        {pane.editor.collapsed ? (
          <CollapsedPaneToggle
            side="editor"
            onToggle={() => pane.togglePane('editor')}
          />
        ) : (
          <>
            <aside
              ref={editorRef}
              aria-label="Editor pane"
              style={{
                width:
                  pane.editor.width ??
                  `${PANE_LIMITS.editorDefaultRatio * 100}%`,
                minWidth: PANE_LIMITS.editorMin,
              }}
              className="flex flex-col bg-surface"
            >
              <WelcomeStrip />
              <div className="flex min-h-0 flex-1 flex-col">
                {/* Ctrl/Cmd+Enter and scroll events route to the Paper Canvas
                    via the shell's canvas API ref. */}
                <EditorPane
                  onRequestRender={() => canvasApiRef.current?.renderNow()}
                  onEditorScroll={(fraction) =>
                    canvasApiRef.current?.setScrollFraction(fraction)
                  }
                />
              </div>
            </aside>
            <PaneDivider
              side="editor"
              getStartWidth={() => editorRef.current?.offsetWidth ?? 0}
              onResize={(width) => pane.setPaneWidth('editor', width)}
              onToggle={() => pane.togglePane('editor')}
              onReset={() => pane.resetPaneWidth('editor')}
            />
          </>
        )}

        <main
          aria-label="Paper Canvas"
          style={{ minWidth: PANE_LIMITS.canvasMin }}
          className="flex min-w-0 flex-1 flex-col"
        >
          <PaperCanvas ref={canvasApiRef} />
        </main>

        {pane.inspector.collapsed ? (
          <CollapsedPaneToggle
            side="inspector"
            onToggle={() => pane.togglePane('inspector')}
          />
        ) : (
          <>
            <PaneDivider
              side="inspector"
              getStartWidth={() => inspectorRef.current?.offsetWidth ?? 0}
              onResize={(width) => pane.setPaneWidth('inspector', width)}
              onToggle={() => pane.togglePane('inspector')}
              onReset={() => pane.resetPaneWidth('inspector')}
            />
            <aside
              ref={inspectorRef}
              aria-label="Inspector pane"
              style={{
                width: pane.inspector.width,
                minWidth: PANE_LIMITS.inspectorMin,
              }}
              className="flex flex-col bg-surface"
            >
              <Inspector />
            </aside>
          </>
        )}
      </div>

      {draggingFiles && (
        <div
          data-testid="drop-overlay"
          className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-black/25 p-6"
        >
          <div className="flex flex-col items-center gap-2 rounded-pane border-2 border-dashed border-accent bg-surface px-10 py-8 text-accent shadow-xl">
            <UploadIcon className="text-2xl" />
            <p className="text-sm font-medium text-ink">
              Drop .md files to import
            </p>
          </div>
        </div>
      )}

      {libraryOpen && <LibraryPanel onClose={() => setLibraryOpen(false)} />}
      {upgradeStatusOpen && (
        <UpgradeStatusDialog onClose={() => setUpgradeStatusOpen(false)} />
      )}
      {historyOpen && <HistoryDialog onClose={() => setHistoryOpen(false)} />}
      <DeleteToast />
    </div>
  );
}
