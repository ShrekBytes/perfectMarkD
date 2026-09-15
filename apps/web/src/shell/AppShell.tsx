import { useCallback, useEffect, useRef, useState } from 'react';
import { TopBar } from './TopBar';
import { StaleBanner } from './StaleBanner';
import { PlanEndedBanner } from './PlanEndedBanner';
import { CollapsedPaneToggle, PaneDivider } from './PaneDivider';
import { PaneSwitcher } from './PaneSwitcher';
import { WelcomeStrip } from './WelcomeStrip';
import { CloseIcon, UploadIcon } from './icons';
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
import { proofGaugeLabel } from '../documents/text';
import { PaperCanvas, type PaperCanvasApi } from '../canvas/PaperCanvas';
import { Inspector } from '../inspector/Inspector';

/**
 * The app shell: top bar + three panes (editor · Paper Canvas · inspector).
 *
 * Above `SHELL_WIDE_MIN` (860px — the three panes' own minimum widths) the
 * panes are resizable columns that collapse via their divider toggles; with
 * both collapsed the shell is in fullscreen-canvas mode. Below it the row
 * cannot fit its minimums, so the shell switches to one pane at a time with an
 * always-visible `PaneSwitcher` — the panes stay mounted and the inactive ones
 * are hidden, so the preview keeps rendering and no editor or canvas state is
 * lost when the user switches views. Both modes share one layout hook
 * (pane-layout.ts) and one set of panes.
 *
 * Document state lives in the document store; the Library drawer, delete-undo
 * toast, and .md drag-drop import (with a rejection toast for non-Markdown
 * files) mount here. The three notice strips (staleness conflict, plan-ended,
 * first-run welcome) mount at shell level under the top bar in that fixed
 * order, so a collapsed pane — or a compact view switch — can never hide a
 * notice. The account store refreshes on a watchdog so Plan Expiry re-locks the
 * gates in a long-lived tab (billing/04).
 */
export function AppShell() {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const pane = usePaneLayout(containerRef);
  const { theme, toggle } = useTheme();
  const compact = pane.mode === 'compact';

  const docName = useDocumentStore((state) =>
    state.activeId ? state.name : 'Untitled document',
  );
  const saveState = useDocumentStore((state) =>
    state.activeId ? state.saveState : null,
  );
  // The proofing gauge (proof-desk-chrome): the active document's paper
  // facts beside its name. Null when no document is open — no readout with
  // nothing to read about.
  const gauge = useDocumentStore((state) =>
    state.activeId ? proofGaugeLabel(state.settings, state.pageCount) : null,
  );
  const renameDocument = useDocumentStore((state) => state.renameDocument);
  const importDocument = useDocumentStore((state) => state.importDocument);

  const [libraryOpen, setLibraryOpen] = useState(false);
  const [upgradeStatusOpen, setUpgradeStatusOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  /** Names of files from the last drop that were not Markdown. */
  const [rejectedDrop, setRejectedDrop] = useState<string[] | null>(null);

  /** The canvas exposes its API through this ref so the editor's Ctrl/Cmd+Enter
   *  and scroll events reach it without threading through re-renders. */
  const canvasApiRef = useRef<PaperCanvasApi | null>(null);

  useEffect(() => {
    void useDocumentStore.getState().init();
    // The account menu (billing/01) needs to know who is signed in.
    void useAccountStore.getState().load();
  }, []);

  // Expiry watchdog (billing/04): Plan Expiry is a date, not a session event,
  // so a tab left open would keep its gates open forever without a periodic
  // re-check. Once a minute (while signed in) the refresh re-locks the gates
  // and raises the plan-ended banner when /api/me reports the plan gone.
  useEffect(() => {
    const id = setInterval(() => {
      const account = useAccountStore.getState();
      if (account.user) void account.refresh();
    }, 60_000);
    return () => clearInterval(id);
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
  const handleRejectedDrop = useCallback((files: File[]) => {
    setRejectedDrop(files.map((file) => file.name));
  }, []);
  const draggingFiles = useFileDrop(importFiles, handleRejectedDrop);

  // The rejected-drop toast leaves on its own — transient chrome for a
  // transient mistake — and resets its window when another drop lands.
  useEffect(() => {
    if (!rejectedDrop) return;
    const timer = setTimeout(() => setRejectedDrop(null), 6000);
    return () => clearTimeout(timer);
  }, [rejectedDrop]);

  return (
    <div className="pm-shell flex h-full flex-col overflow-hidden bg-canvas text-ink">
      <TopBar
        docName={docName}
        onRename={(name) => {
          const activeId = useDocumentStore.getState().activeId;
          if (activeId) void renameDocument(activeId, name);
        }}
        saveState={saveState}
        gauge={gauge}
        libraryOpen={libraryOpen}
        onOpenLibrary={() => setLibraryOpen(true)}
        theme={theme}
        onToggleTheme={toggle}
        onOpenUpgradeStatus={() => setUpgradeStatusOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
        mode={pane.mode}
      />

      {compact && (
        // The compact workspace's navigation row: the view switcher plus the
        // autosave readout the top bar handed over. Sits directly under the
        // bar so it never moves when a notice strip appears.
        <div
          data-testid="compact-bar"
          className="flex min-h-10 shrink-0 items-center gap-2 border-b border-hairline bg-surface px-2"
        >
          <PaneSwitcher
            value={pane.compactPane}
            onChange={pane.setCompactPane}
          />
          {saveState && (
            <span
              aria-live="polite"
              data-testid="save-state"
              className="ml-auto min-w-14 text-right select-none text-xs text-ink-faint"
            >
              {saveState === 'saving' ? 'Saving…' : 'Saved'}
            </span>
          )}
        </div>
      )}

      <StaleBanner />
      <PlanEndedBanner />
      <WelcomeStrip />

      <div
        ref={containerRef}
        data-testid="shell-content"
        data-layout={pane.mode}
        data-fullscreen={!compact && pane.fullscreen ? '' : undefined}
        className="relative flex min-h-0 flex-1"
      >
        {!compact && pane.editor.collapsed ? (
          <CollapsedPaneToggle
            side="editor"
            onToggle={() => pane.togglePane('editor')}
          />
        ) : (
          <>
            <aside
              ref={editorRef}
              aria-label="Editor pane"
              style={
                compact
                  ? undefined
                  : {
                      width:
                        pane.editor.width ??
                        `${PANE_LIMITS.editorDefaultRatio * 100}%`,
                      minWidth: PANE_LIMITS.editorMin,
                    }
              }
              className={`${
                !compact || pane.compactPane === 'editor' ? 'flex' : 'hidden'
              } min-h-0 flex-col bg-surface ${compact ? 'w-full min-w-0' : ''}`}
            >
              {/* Ctrl/Cmd+Enter and scroll events route to the Paper Canvas
                  via the shell's canvas API ref. */}
              <EditorPane
                onRequestRender={() => canvasApiRef.current?.renderNow()}
                onEditorScroll={(fraction) =>
                  canvasApiRef.current?.setScrollFraction(fraction)
                }
              />
            </aside>
            {!compact && (
              <PaneDivider
                side="editor"
                getStartWidth={() => editorRef.current?.offsetWidth ?? 0}
                getMaxWidth={() => pane.maxPaneWidth('editor')}
                onResize={(width) => pane.setPaneWidth('editor', width)}
                onToggle={() => pane.togglePane('editor')}
                onReset={() => pane.resetPaneWidth('editor')}
              />
            )}
          </>
        )}

        <main
          aria-label="Paper Canvas"
          style={compact ? undefined : { minWidth: PANE_LIMITS.canvasMin }}
          className={`${
            !compact || pane.compactPane === 'canvas' ? 'flex' : 'hidden'
          } min-w-0 flex-1 flex-col`}
        >
          <PaperCanvas ref={canvasApiRef} />
        </main>

        {!compact && pane.inspector.collapsed ? (
          <CollapsedPaneToggle
            side="inspector"
            onToggle={() => pane.togglePane('inspector')}
          />
        ) : (
          <>
            {!compact && (
              <PaneDivider
                side="inspector"
                getStartWidth={() => inspectorRef.current?.offsetWidth ?? 0}
                getMaxWidth={() => pane.maxPaneWidth('inspector')}
                onResize={(width) => pane.setPaneWidth('inspector', width)}
                onToggle={() => pane.togglePane('inspector')}
                onReset={() => pane.resetPaneWidth('inspector')}
              />
            )}
            <aside
              ref={inspectorRef}
              aria-label="Inspector pane"
              style={
                compact
                  ? undefined
                  : {
                      width: pane.inspector.width,
                      minWidth: PANE_LIMITS.inspectorMin,
                    }
              }
              className={`${
                !compact || pane.compactPane === 'inspector' ? 'flex' : 'hidden'
              } min-h-0 flex-col bg-surface ${compact ? 'w-full min-w-0' : ''}`}
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
          <div className="flex flex-col items-center gap-2 rounded-pane border-2 border-dashed border-ink bg-surface px-10 py-8 text-ink shadow-xl">
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
      {rejectedDrop && (
        <div
          role="status"
          data-testid="drop-rejected-toast"
          className="pointer-events-none fixed inset-x-0 bottom-16 z-[60] flex justify-center"
        >
          <div className="animate-fade-in pointer-events-auto flex items-center gap-3 rounded-pane border border-hairline-strong bg-surface px-4 py-2.5 shadow-lg">
            <p className="text-sm text-ink">
              {rejectedDrop.length === 1
                ? `Only .md files can be imported. "${rejectedDrop[0]}" is not Markdown — convert it to .md or paste its text into the editor.`
                : `Only .md files can be imported. ${rejectedDrop.length} of the dropped files are not Markdown — convert them to .md or paste their text into the editor.`}
            </p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setRejectedDrop(null)}
              className="touch-target flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-ink-faint transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
            >
              <CloseIcon />
            </button>
          </div>
        </div>
      )}
      <DeleteToast />
    </div>
  );
}
