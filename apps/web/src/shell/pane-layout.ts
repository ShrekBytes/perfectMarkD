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

/**
 * The workspace's content-width breakpoint. The three-pane row needs
 * 280 + 320 + 260 = 860px of container width (the dividers are `w-4 -mx-2`,
 * so they contribute no net width). Below it the row is wider than its bench
 * and would be clipped — not scrolled. This is a content-driven breakpoint,
 * not a device one: it is exactly where the three-column composition breaks.
 */
export const SHELL_WIDE_MIN = 860;

/** Wide = the three-pane desktop row; compact = one pane plus its switcher. */
export type ShellMode = 'wide' | 'compact';

/** Which pane the compact layout presents. */
export type CompactPane = 'editor' | 'canvas' | 'inspector';

/**
 * Container width → shell mode. An unknown width (0: first paint before layout
 * has run, or jsdom) keeps the wide layout: the workspace must never collapse
 * to a single pane on a guess.
 */
export function shellModeFor(containerWidth: number): ShellMode {
  if (containerWidth <= 0) return 'wide';
  return containerWidth >= SHELL_WIDE_MIN ? 'wide' : 'compact';
}

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
 * A pane's own resize floor: its minimum width, or nothing at all once it is
 * collapsed.
 *
 * The resize negotiation is coupled, and flexbox performs it in exactly this
 * order: the Paper Canvas gives first (down to `canvasMin`), then the neighbor
 * pane yields down to its own floor. Clamping against the neighbor's
 * *requested* width instead would forbid grows the layout would happily have
 * performed — that mismatch between the splitter's arithmetic and the DOM was
 * the silent keyboard-resize dead zone just above `SHELL_WIDE_MIN`.
 */
function paneFloor(id: PaneId, layout: PaneLayoutState): number {
  if (id === 'editor') {
    return layout.editor.collapsed ? 0 : PANE_LIMITS.editorMin;
  }
  return layout.inspector.collapsed ? 0 : PANE_LIMITS.inspectorMin;
}

/**
 * Clamp a pane's desired width so the Paper Canvas keeps at least `canvasMin`
 * and the neighbor pane keeps its floor. When the container is too small for
 * every minimum, the pane minimum wins (flexbox then degrades the canvas
 * gracefully).
 */
export function clampPaneWidth(
  id: PaneId,
  desired: number,
  containerWidth: number,
  layout: PaneLayoutState,
): number {
  const min = paneFloor(id, layout);
  const other: PaneId = id === 'editor' ? 'inspector' : 'editor';
  const max = containerWidth - PANE_LIMITS.canvasMin - paneFloor(other, layout);
  return Math.min(Math.max(desired, min), Math.max(max, min));
}

/**
 * Three-pane shell layout state: collapse toggles, drag-resize with min widths,
 * fullscreen canvas mode (both side panes collapsed), and — below
 * `SHELL_WIDE_MIN` — the compact single-pane mode with its switcher.
 *
 * `containerRef` only needs `clientWidth` — React refs satisfy it structurally.
 * Container-width changes (window resize) bump a `containerWidth` state so
 * width-dependent readouts like the splitter's aria-valuemax re-render, and so
 * the shell can move between wide and compact.
 */
export function usePaneLayout(containerRef: {
  current: { clientWidth: number } | null;
}) {
  const [layout, setLayout] = useState<PaneLayoutState>({
    editor: { collapsed: false, width: null },
    inspector: { collapsed: false, width: PANE_LIMITS.inspectorDefault },
  });
  const [containerWidth, setContainerWidth] = useState(0);
  /** The compact layout's visible pane; the desktop collapse state is separate
   *  so resizing between modes never loses a pane width or a collapse. */
  const [compactPane, setCompactPaneState] = useState<CompactPane>('editor');

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
    (id: PaneId, desired: number) => {
      const containerWidth = containerRef.current?.clientWidth ?? 0;
      setLayout((current) => {
        const width = clampPaneWidth(id, desired, containerWidth, current);
        const other: PaneId = id === 'editor' ? 'inspector' : 'editor';
        const otherFloor = paneFloor(other, current);
        const otherWidth =
          other === 'inspector'
            ? current.inspector.collapsed
              ? 0
              : current.inspector.width
            : effectiveEditorWidth(current.editor, containerWidth);
        // Write the neighbor's yielded width so the state describes what the
        // DOM will actually render: when this pane's growth would push the
        // canvas under its minimum, the neighbor gives up the difference down
        // to its own floor. Without this the two could drift apart — the
        // splitter's state refusing a grow the layout had already granted.
        const over =
          PANE_LIMITS.canvasMin + width + otherWidth - containerWidth;
        if (over <= 0 || otherFloor === 0 || otherWidth <= otherFloor) {
          return { ...current, [id]: { ...current[id], width } };
        }
        const yielded = Math.max(
          otherFloor,
          containerWidth - PANE_LIMITS.canvasMin - width,
        );
        return {
          ...current,
          [id]: { ...current[id], width },
          [other]: { ...current[other], width: yielded },
        };
      });
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

  const setCompactPane = useCallback((pane: CompactPane) => {
    setCompactPaneState(pane);
  }, []);

  /** The container's live width: the observed value re-renders on window
   *  resizes, while the DOM's own width is the first-paint answer before the
   *  observer has fired. */
  const liveContainerWidth =
    containerRef.current?.clientWidth || containerWidth;
  const mode = shellModeFor(liveContainerWidth);

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
      mode,
      compactPane,
      setCompactPane,
      togglePane,
      setPaneWidth,
      maxPaneWidth,
      resetPaneWidth,
    }),
    [
      layout,
      fullscreen,
      mode,
      compactPane,
      setCompactPane,
      togglePane,
      setPaneWidth,
      maxPaneWidth,
      resetPaneWidth,
    ],
  );
}
