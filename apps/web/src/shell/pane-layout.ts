import { useCallback, useMemo, useState } from 'react';

/** Sizing contract for the three-pane shell, per the editor-app layout spec. */
export const PANE_LIMITS = {
  /** Editor pane defaults to ~38% of the shell width. */
  editorDefaultRatio: 0.38,
  editorMin: 280,
  /** Inspector defaults to a fixed 320px column. */
  inspectorDefault: 320,
  inspectorMin: 260,
  /** The Paper Canvas never shrinks below this while resizing. */
  canvasMin: 320,
} as const;

export type PaneId = 'editor' | 'inspector';

export interface PaneLayoutState {
  editor: { collapsed: boolean; width: number | null };
  inspector: { collapsed: boolean; width: number };
}

/** The editor's on-screen width: its explicit width, the 38% default, or 0 when collapsed. */
export function effectiveEditorWidth(
  editor: PaneLayoutState['editor'],
  containerWidth: number,
): number {
  if (editor.collapsed) return 0;
  return (
    editor.width ?? Math.round(containerWidth * PANE_LIMITS.editorDefaultRatio)
  );
}

/**
 * Clamp a pane's desired width so both panes keep their minimums and the Paper
 * Canvas keeps at least `canvasMin`. When the container is too small for every
 * minimum, the pane minimum wins (flexbox then degrades the canvas gracefully).
 */
export function clampPaneWidth(
  id: PaneId,
  desired: number,
  containerWidth: number,
  layout: PaneLayoutState,
): number {
  const min =
    id === 'editor' ? PANE_LIMITS.editorMin : PANE_LIMITS.inspectorMin;
  const otherPane =
    id === 'editor'
      ? layout.inspector.collapsed
        ? 0
        : layout.inspector.width
      : effectiveEditorWidth(layout.editor, containerWidth);
  const max = containerWidth - PANE_LIMITS.canvasMin - otherPane;
  return Math.min(Math.max(desired, min), Math.max(max, min));
}

/**
 * Three-pane shell layout state: collapse toggles, drag-resize with min widths,
 * and fullscreen canvas mode (both side panes collapsed).
 *
 * `containerRef` only needs `clientWidth` — React refs satisfy it structurally.
 */
export function usePaneLayout(containerRef: {
  current: { clientWidth: number } | null;
}) {
  const [layout, setLayout] = useState<PaneLayoutState>({
    editor: { collapsed: false, width: null },
    inspector: { collapsed: false, width: PANE_LIMITS.inspectorDefault },
  });

  const togglePane = useCallback((id: PaneId) => {
    setLayout((current) => ({
      ...current,
      [id]: { ...current[id], collapsed: !current[id].collapsed },
    }));
  }, []);

  const setPaneWidth = useCallback(
    (id: PaneId, width: number) => {
      const containerWidth = containerRef.current?.clientWidth ?? 0;
      setLayout((current) => ({
        ...current,
        [id]: {
          ...current[id],
          width: clampPaneWidth(id, width, containerWidth, current),
        },
      }));
    },
    [containerRef],
  );

  const resetPaneWidth = useCallback((id: PaneId) => {
    setLayout((current) => ({
      ...current,
      [id]: {
        ...current[id],
        width: id === 'editor' ? null : PANE_LIMITS.inspectorDefault,
      },
    }));
  }, []);

  const fullscreen = layout.editor.collapsed && layout.inspector.collapsed;

  return useMemo(
    () => ({ ...layout, fullscreen, togglePane, setPaneWidth, resetPaneWidth }),
    [layout, fullscreen, togglePane, setPaneWidth, resetPaneWidth],
  );
}
