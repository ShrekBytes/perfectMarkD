import { useCallback, useEffect, useRef, useState } from 'react';
import { TopBar } from './TopBar';
import { StaleBanner } from './StaleBanner';
import { EmptyState } from './EmptyState';
import { CollapsedPaneToggle, PaneDivider } from './PaneDivider';
import { PagesIcon, SlidersIcon, UploadIcon } from './icons';
import { PANE_LIMITS, usePaneLayout } from './pane-layout';
import { useTheme } from '../theme/theme';
import { useDocumentStore } from '../documents/store';
import { EditorPane } from '../editor/EditorPane';
import { DeleteToast } from '../library/DeleteToast';
import { LibraryPanel } from '../library/LibraryPanel';
import { useFileDrop } from '../library/useFileDrop';

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

  const status = useDocumentStore((state) => state.status);
  const docName = useDocumentStore((state) =>
    state.activeId ? state.name : 'Untitled document',
  );
  const saveState = useDocumentStore((state) =>
    state.activeId ? state.saveState : null,
  );
  const renameDocument = useDocumentStore((state) => state.renameDocument);
  const importDocument = useDocumentStore((state) => state.importDocument);

  const [libraryOpen, setLibraryOpen] = useState(false);

  useEffect(() => {
    void useDocumentStore.getState().init();
  }, []);

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
              {/* Ctrl/Cmd+Enter render and the image picker wire up in
                  tickets 04 and 08. */}
              <EditorPane />
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
          className="flex flex-1 flex-col"
        >
          <EmptyState
            icon={<PagesIcon />}
            title="Paper Canvas"
            hint={
              status === 'loading'
                ? 'Loading your documents…'
                : 'Your pages will appear here as you write.'
            }
          />
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
              <EmptyState
                icon={<SlidersIcon />}
                title="Inspector"
                hint="Page, style, and header/footer settings live here."
              />
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
      <DeleteToast />
    </div>
  );
}
