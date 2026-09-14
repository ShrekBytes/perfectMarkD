import { useCallback, useEffect, useMemo, useState } from 'react';

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
 * Container-width changes (window resize) bump a `containerWidth` state so
 * width-dependent readouts like the splitter's aria-valuemax re-render.
 */
export function usePaneLayout(containerRef: {
  current: { clientWidth: number } | null;
}) {
  const [layout, setLayout] = useState<PaneLayoutState>({
    editor: { collapsed: false, width: null },
    inspector: { collapsed: false, width: PANE_LIMITS.inspectorDefault },
  });
  const [containerWidth, setContainerWidth] = useState(0);

  // Track the container's width so aria-valuemax stays live on window
  // resizes (pane drags change layout state anyway; window resizes don't).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      setContainerWidth(el.clientWidth);
    });
    // The ref type is structural (clientWidth only) so tests can stub it;
    // at runtime it is always the shell's div.
    observer.observe(el as Element);
    return () => observer.disconnect();
  }, [containerRef]);

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

  /** The largest width the pane can take right now (aria-valuemax for the
   *  splitter): the clamp's ceiling, floored at the pane minimum. Reads the
   *  observed `containerWidth` so it re-renders on window resizes; the live
   *  DOM width wins when they disagree (mid-drag frames). */
  const maxPaneWidth = useCallback(
    (id: PaneId) =>
      clampPaneWidth(
        id,
        Number.POSITIVE_INFINITY,
        containerRef.current?.clientWidth || containerWidth,
        layout,
      ),
    [layout, containerRef, containerWidth],
  );

  return useMemo(
    () => ({
      ...layout,
      fullscreen,
      togglePane,
      setPaneWidth,
      maxPaneWidth,
      resetPaneWidth,
    }),
    [layout, fullscreen, togglePane, setPaneWidth, maxPaneWidth, resetPaneWidth],
  );
}
