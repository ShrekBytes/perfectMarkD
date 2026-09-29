// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SHELL_WIDE_MIN, usePaneLayout } from './pane-layout';

const CONTAINER = 1200;

afterEach(() => cleanup());

describe('usePaneLayout compact mode', () => {
  it('keeps the three-pane row at the breakpoint and goes compact one pixel below', () => {
    // 280 editor + 320 canvas + 260 inspector — the row's own minimum, not a
    // device width. Read through the hook, so the boundary is pinned where the
    // shell actually reads it.
    expect(SHELL_WIDE_MIN).toBe(860);
    const at = renderHook(() =>
      usePaneLayout({ current: { clientWidth: SHELL_WIDE_MIN } }),
    );
    expect(at.result.current.mode).toBe('wide');
    const below = renderHook(() =>
      usePaneLayout({ current: { clientWidth: SHELL_WIDE_MIN - 1 } }),
    );
    expect(below.result.current.mode).toBe('compact');
  });

  it('never collapses the workspace on an unknown width', () => {
    // First paint before layout, and jsdom: the desktop layout stands.
    const { result } = renderHook(() =>
      usePaneLayout({ current: { clientWidth: 0 } }),
    );
    expect(result.current.mode).toBe('wide');
  });

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

  it('holds each pane at its own floor — the three that sum to 860', () => {
    // The 860 Rule (DESIGN.md, ADR-0006) is a claim about these three numbers,
    // so it is pinned here rather than left to the sum in `PANE_LIMITS`: a
    // pane asked for less than its floor gets the floor, and the canvas keeps
    // its own 320 minimum.
    const { result } = renderHook(() => usePaneLayout(containerRef));
    act(() => result.current.setPaneWidth('editor', 100));
    expect(result.current.editor.width).toBe(280);
    act(() => result.current.setPaneWidth('inspector', 100));
    expect(result.current.inspector.width).toBe(260);
    // The editor's floor is what the canvas's minimum is measured against:
    // 1200 - 320 canvas - 260 inspector is the editor's ceiling.
    act(() => result.current.setPaneWidth('editor', 5000));
    expect(result.current.editor.width).toBe(1200 - 320 - 260);
  });

  it('protects the pane minimum when the container cannot hold them all', () => {
    // 800 - 320 canvas - 320 inspector leaves 160 of editor, below its 280
    // minimum: the pane minimum wins and the canvas degrades, so the row never
    // renders a pane narrower than the rule allows.
    const tightRef = { current: { clientWidth: 800 } };
    const { result } = renderHook(() => usePaneLayout(tightRef));
    act(() => result.current.setPaneWidth('editor', 400));

    expect(result.current.editor.width).toBe(280);
    expect(result.current.inspector.width).toBe(260);
  });

  it('lets the open pane grow across a collapsed one', () => {
    const { result } = renderHook(() => usePaneLayout(containerRef));
    act(() => result.current.togglePane('editor'));
    act(() => result.current.setPaneWidth('inspector', 900));
    // A collapsed neighbour has no floor to protect, so the inspector takes
    // everything above the canvas minimum.
    expect(result.current.inspector.width).toBe(1200 - 320);
    expect(result.current.editor.collapsed).toBe(true);
  });
});
