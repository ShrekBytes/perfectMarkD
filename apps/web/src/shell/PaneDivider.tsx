import { useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import { PANE_LIMITS, type PaneId } from './pane-layout';

/** Keyboard resize step (Shift multiplies it), in px. */
const RESIZE_STEP = 16;

interface PaneDividerProps {
  /** Which pane this divider collapses/restores; also its accessible name. */
  side: PaneId;
  /** Current pane width in px, read live (drag start, keyboard, aria). */
  getStartWidth: () => number;
  /** Largest width the pane can take right now, read live for aria-valuemax. */
  getMaxWidth: () => number;
  /** Called while dragging or keyboard-resizing with the pane's desired width in px. */
  onResize: (width: number) => void;
  onToggle: () => void;
  onReset: () => void;
}

/**
 * The 1px hairline between two panes: a drag handle for resizing plus a
 * chevron toggle that collapses the adjacent pane. The separator is a real
 * ARIA splitter — focusable, with Arrow-key resize and Enter to reset — and
 * the chevron sits off-center so the middle of the line stays a drag zone.
 */
export function PaneDivider({
  side,
  getStartWidth,
  getMaxWidth,
  onResize,
  onToggle,
  onReset,
}: PaneDividerProps) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  /** The splitter's range. When the container only fits the panes' minimums
   *  (exactly at 860px, or after a neighbor gave all it had) there is nothing
   *  to resize — a focusable splitter that silently refuses its arrow keys
   *  reads as broken, so the range is announced instead. */
  const min =
    side === 'editor' ? PANE_LIMITS.editorMin : PANE_LIMITS.inspectorMin;
  const max = Math.round(getMaxWidth());
  const resizable = max > min;

  /** The editor's divider sits at the editor's right edge (drag right =
   *  wider); the inspector's sits at its left edge (drag left = wider). */
  const dragSign = side === 'editor' ? 1 : -1;

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    drag.current = { startX: event.clientX, startWidth: getStartWidth() };
    // jsdom lacks pointer capture; real browsers keep the drag alive outside the element.
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    onResize(
      drag.current.startWidth +
        dragSign * (event.clientX - drag.current.startX),
    );
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!resizable && event.key !== 'Enter') return;
    const step = event.shiftKey ? RESIZE_STEP * 4 : RESIZE_STEP;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        onResize(getStartWidth() + step);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        onResize(getStartWidth() - step);
        break;
      case 'Enter':
        onReset();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const CollapseIcon = side === 'editor' ? ChevronLeftIcon : ChevronRightIcon;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${side} pane`}
      aria-valuenow={Math.round(getStartWidth())}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-disabled={!resizable || undefined}
      title={
        resizable
          ? 'Drag to resize — double-click or press Enter to reset'
          : 'No room to resize — the panes and the paper are at their minimum widths'
      }
      tabIndex={0}
      className={`touch-divider group relative z-10 -mx-2 w-4 shrink-0 touch-none select-none rounded-control outline-offset-2 outline-accent focus-visible:outline-2 ${
        resizable ? 'cursor-col-resize' : 'cursor-default'
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-hairline transition-colors duration-150 group-focus-visible:bg-accent group-hover:bg-accent" />
      <button
        type="button"
        aria-label={`Collapse ${side} pane`}
        title={`Collapse ${side} pane`}
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onClick={onToggle}
        className="absolute left-1/2 top-6 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-control border border-hairline bg-surface text-ink-faint opacity-0 shadow-sm transition-opacity duration-150 outline-offset-2 outline-accent hover:text-ink focus-visible:opacity-100 focus-visible:outline-2 group-focus-within:opacity-100 group-hover:opacity-100"
      >
        <CollapseIcon />
      </button>
    </div>
  );
}

/** Floating restore toggle shown at the canvas edge while a pane is collapsed. */
export function CollapsedPaneToggle({
  side,
  onToggle,
}: {
  side: PaneId;
  onToggle: () => void;
}) {
  const RestoreIcon = side === 'editor' ? ChevronRightIcon : ChevronLeftIcon;
  return (
    <button
      type="button"
      aria-label={`Show ${side} pane`}
      title={`Show ${side} pane`}
      onClick={onToggle}
      className={`touch-target absolute top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-control border border-hairline bg-surface text-ink-faint shadow-sm transition-colors duration-150 outline-offset-2 outline-accent hover:text-ink focus-visible:outline-2 ${
        side === 'editor' ? 'left-2' : 'right-2'
      }`}
    >
      <RestoreIcon />
    </button>
  );
}
