// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clampPaneWidth,
  effectiveEditorWidth,
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

  it('enforces the canvas minimum against the other pane', () => {
    expect(clampPaneWidth('editor', 900, CONTAINER, openLayout)).toBe(560);
    // editor default = 456 → inspector max = 1200 - 456 - 320 = 424
    expect(clampPaneWidth('inspector', 500, CONTAINER, openLayout)).toBe(424);
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

  it('measures a default-ratio editor against the real container', () => {
    const narrow = {
      ...openLayout,
      inspector: { collapsed: false, width: 260 },
    };
    // editor effective 380 → inspector max = 1000 - 380 - 320 = 300
    expect(clampPaneWidth('inspector', 400, 1000, narrow)).toBe(300);
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

  it('keeps the width of a pane while it is collapsed', () => {
    const { result } = renderHook(() => usePaneLayout(containerRef));
    act(() => result.current.setPaneWidth('editor', 500));
    act(() => result.current.togglePane('editor'));
    expect(result.current.editor).toEqual({ collapsed: true, width: 500 });
    act(() => result.current.togglePane('editor'));
    expect(result.current.editor).toEqual({ collapsed: false, width: 500 });
  });

  it('clamps setPaneWidth against the container', () => {
    const { result } = renderHook(() => usePaneLayout(containerRef));
    act(() => result.current.setPaneWidth('editor', 5000));
    expect(result.current.editor.width).toBe(560);
    act(() => result.current.resetPaneWidth('editor'));
    expect(result.current.editor.width).toBeNull();
  });
});
