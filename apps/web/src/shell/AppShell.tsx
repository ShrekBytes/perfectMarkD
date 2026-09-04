import { useRef, useState } from 'react';
import { TopBar } from './TopBar';
import { EmptyState } from './EmptyState';
import { CollapsedPaneToggle, PaneDivider } from './PaneDivider';
import { FileTextIcon, PagesIcon, SlidersIcon } from './icons';
import { PANE_LIMITS, usePaneLayout } from './pane-layout';
import { useTheme } from '../theme/theme';

/**
 * The app shell: top bar + three panes (editor · Paper Canvas · inspector).
 * Panes collapse via their divider toggles; with both collapsed the shell is in
 * fullscreen-canvas mode.
 */
export function AppShell() {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const pane = usePaneLayout(containerRef);
  const { theme, toggle } = useTheme();

  // Local until the document store lands (editor-app/02) and owns the name.
  const [docName, setDocName] = useState('Untitled document');

  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas text-ink">
      <TopBar docName={docName} onRename={setDocName} theme={theme} onToggleTheme={toggle} />

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
                width: pane.editor.width ?? `${PANE_LIMITS.editorDefaultRatio * 100}%`,
                minWidth: PANE_LIMITS.editorMin,
              }}
              className="flex flex-col bg-surface"
            >
              <EmptyState
                icon={<FileTextIcon />}
                title="Editor"
                hint="Start writing — your markdown goes here."
              />
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
            hint="Your pages will appear here as you write."
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
              style={{ width: pane.inspector.width, minWidth: PANE_LIMITS.inspectorMin }}
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
    </div>
  );
}
