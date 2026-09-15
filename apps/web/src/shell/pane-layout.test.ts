// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clampPaneWidth,
  effectiveEditorWidth,
  SHELL_WIDE_MIN,
  shellModeFor,
  usePaneLayout,
  type PaneLayoutState,
} from './pane-layout';

const CONTAINER = 1200;

const openLayout: PaneLayoutState = {
  editor: { collapsed: false, width: null },
  inspector: { collapsed: false, width: 320 },
};

afterEach(() => cleanup());

describe('effectiveEditorWidth', () => {
  it('falls back to the 38% default ratio', () => {
    expect(effectiveEditorWidth(openLayout.editor, CONTAINER)).toBe(456);
  });

  it('uses the explicit width when set', () => {
    expect(
      effectiveEditorWidth({ collapsed: false, width: 500 }, CONTAINER),
    ).toBe(500);
  });

  it('collapses to zero', () => {
    expect(
      effectiveEditorWidth({ collapsed: true, width: null }, CONTAINER),
    ).toBe(0);
  });
});

describe('clampPaneWidth', () => {
  it('keeps desired widths inside the limits', () => {
    // max editor = 1200 - 320 (canvas min) - 320 (inspector) = 560
    expect(clampPaneWidth('editor', 500, CONTAINER, openLayout)).toBe(500);
    expect(clampPaneWidth('inspector', 300, CONTAINER, openLayout)).toBe(300);
  });

  it('enforces min widths', () => {
    expect(clampPaneWidth('editor', 100, CONTAINER, openLayout)).toBe(280);
    expect(clampPaneWidth('inspector', 100, CONTAINER, openLayout)).toBe(260);
  });

  it('enforces the canvas minimum against the neighbor pane', () => {
    // The canvas keeps its 320px minimum; the neighbor yields down to its own
    // floor: editor max = 1200 - 320 - 260, inspector max = 1200 - 320 - 280.
    expect(clampPaneWidth('editor', 900, CONTAINER, openLayout)).toBe(620);
    expect(clampPaneWidth('inspector', 700, CONTAINER, openLayout)).toBe(600);
  });

  it('lets a pane grow over the collapsed pane', () => {
    const editorCollapsed: PaneLayoutState = {
      ...openLayout,
      editor: { collapsed: true, width: 400 },
    };
    expect(clampPaneWidth('inspector', 900, CONTAINER, editorCollapsed)).toBe(
      880,
    );

    const inspectorCollapsed: PaneLayoutState = {
      ...openLayout,
      inspector: { collapsed: true, width: 320 },
    };
    expect(clampPaneWidth('editor', 900, CONTAINER, inspectorCollapsed)).toBe(
      880,
    );
  });

  it('protects the pane minimum when the container is too small', () => {
    // 800 - 320 canvas - 320 inspector = 160 < editor min 280 → min wins
    expect(clampPaneWidth('editor', 400, 800, openLayout)).toBe(280);
  });

  it('grants the neighbor the room the layout can actually spare', () => {
    const narrow = {
      ...openLayout,
      inspector: { collapsed: false, width: 260 },
    };
    // At 1000px the row holds editor min (280) + canvas min (320) + 400 of
    // inspector: the 260px inspector was already squeezed by the container,
    // so the ceiling is what the negotiation can grant, not the old
    // container − 380 (the editor's ratio) − 320 = 300 phantom.
    expect(clampPaneWidth('inspector', 400, 1000, narrow)).toBe(400);
  });
});

describe('shellModeFor', () => {
  it('keeps the three-pane row at and above the panes’ own minimum', () => {
    expect(SHELL_WIDE_MIN).toBe(860); // 280 editor + 320 canvas + 260 inspector
    expect(shellModeFor(SHELL_WIDE_MIN)).toBe('wide');
    expect(shellModeFor(1440)).toBe('wide');
  });

  it('goes compact one pixel below it', () => {
    expect(shellModeFor(SHELL_WIDE_MIN - 1)).toBe('compact');
    expect(shellModeFor(375)).toBe('compact');
  });

  it('never collapses the workspace on an unknown width', () => {
    // First paint before layout, and jsdom: the desktop layout stands.
    expect(shellModeFor(0)).toBe('wide');
  });
});

describe('usePaneLayout compact mode', () => {
  it('starts on the editor and reports the pane the user picked', () => {
    const compactRef = { current: { clientWidth: 420 } };
    const { result } = renderHook(() => usePaneLayout(compactRef));

    expect(result.current.mode).toBe('compact');
    expect(result.current.compactPane).toBe('editor');

    act(() => result.current.setCompactPane('inspector'));
    expect(result.current.compactPane).toBe('inspector');
  });

  it('keeps the desktop collapse state apart from the compact pane', () => {
    const wideRef = { current: { clientWidth: 1200 } };
    const { result } = renderHook(() => usePaneLayout(wideRef));

    expect(result.current.mode).toBe('wide');
    act(() => result.current.togglePane('editor'));
    expect(result.current.editor.collapsed).toBe(true);
    // Collapsing is a wide-layout power; the compact view is unaffected.
    expect(result.current.compactPane).toBe('editor');
    expect(result.current.mode).toBe('wide');
  });
});

describe('usePaneLayout', () => {
  const containerRef = { current: { clientWidth: CONTAINER } };

  it('starts with editor, canvas, and inspector visible', () => {
    const { result } = renderHook(() => usePaneLayout(containerRef));
    expect(result.current.editor).toEqual({ collapsed: false, width: null });
    expect(result.current.inspector).toEqual({ collapsed: false, width: 320 });
    expect(result.current.fullscreen).toBe(false);
  });

  it('toggles panes and derives fullscreen canvas mode', () => {
    const { result } = renderHook(() => usePaneLayout(containerRef));
    act(() => result.current.togglePane('editor'));
    expect(result.current.editor.collapsed).toBe(true);
    expect(result.current.fullscreen).toBe(false);
    act(() => result.current.togglePane('inspector'));
    expect(result.current.fullscreen).toBe(true);
    act(() => result.current.togglePane('editor'));
    expect(result.current.fullscreen).toBe(false);
  });

  it('resolves the 860–920px dead zone by yielding the neighbor', () => {
    // Just above SHELL_WIDE_MIN the old arithmetic (clamp against the
    // neighbor's *requested* width) made every keyboard resize a silent
    // no-op: the row is tight, but the inspector has slack to give.
    const tightRef = { current: { clientWidth: 900 } };
    const { result } = renderHook(() => usePaneLayout(tightRef));
    act(() => result.current.setPaneWidth('editor', 296));
    expect(result.current.editor.width).toBe(296);
    expect(result.current.inspector.width).toBe(900 - 320 - 296);
  });

  it('keeps the width of a pane while it is collapsed', () => {
    const { result } = renderHook(() => usePaneLayout(containerRef));
    act(() => result.current.setPaneWidth('editor', 500));
    act(() => result.current.togglePane('editor'));
    expect(result.current.editor).toEqual({ collapsed: true, width: 500 });
    act(() => result.current.togglePane('editor'));
    expect(result.current.editor).toEqual({ collapsed: false, width: 500 });
  });

  it('clamps setPaneWidth against the container and yields the neighbor', () => {
    const { result } = renderHook(() => usePaneLayout(containerRef));
    act(() => result.current.setPaneWidth('editor', 5000));
    // Editor takes everything above the canvas and inspector minimums, and
    // the coupled write moves the inspector to its floor with it.
    expect(result.current.editor.width).toBe(CONTAINER - 320 - 260);
    expect(result.current.inspector.width).toBe(260);
    act(() => result.current.resetPaneWidth('editor'));
    expect(result.current.editor.width).toBeNull();
  });

  it('leaves the neighbor alone while the canvas still has room', () => {
    const { result } = renderHook(() => usePaneLayout(containerRef));
    act(() => result.current.setPaneWidth('editor', 500));
    // 1200 - 500 - 320 = 380 of canvas: no squeeze, so the inspector keeps
    // its own width.
    expect(result.current.editor.width).toBe(500);
    expect(result.current.inspector.width).toBe(320);
  });
});
