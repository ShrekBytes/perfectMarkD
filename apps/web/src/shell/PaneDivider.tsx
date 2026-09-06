import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import type { PaneId } from './pane-layout';

interface PaneDividerProps {
  /** Which pane this divider collapses/restores; also its accessible name. */
  side: PaneId;
  /** Current pane width in px, read once when a drag starts. */
  getStartWidth: () => number;
  /** Called while dragging with the pane's desired width in px. */
  onResize: (width: number) => void;
  onToggle: () => void;
  onReset: () => void;
}

/**
 * The 1px hairline between two panes: a drag handle for resizing plus a
 * chevron toggle that collapses the adjacent pane.
 */
export function PaneDivider({
  side,
  getStartWidth,
  onResize,
  onToggle,
  onReset,
}: PaneDividerProps) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    drag.current = { startX: event.clientX, startWidth: getStartWidth() };
    // jsdom lacks pointer capture; real browsers keep the drag alive outside the element.
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    onResize(drag.current.startWidth + (event.clientX - drag.current.startX));
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const CollapseIcon = side === 'editor' ? ChevronLeftIcon : ChevronRightIcon;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${side} pane`}
      className="group relative z-10 -mx-2 w-4 shrink-0 cursor-col-resize touch-none select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={onReset}
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-hairline transition-colors duration-150 group-hover:bg-accent" />
      <button
        type="button"
        aria-label={`Collapse ${side} pane`}
        title={`Collapse ${side} pane`}
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onClick={onToggle}
        className="absolute left-1/2 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-hairline bg-surface text-ink-faint opacity-0 shadow-sm transition-opacity duration-150 outline-offset-2 outline-accent hover:text-ink focus-visible:opacity-100 focus-visible:outline-2 group-hover:opacity-100"
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
      className={`absolute top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-hairline bg-surface text-ink-faint shadow-sm transition-colors duration-150 outline-offset-2 outline-accent hover:text-ink focus-visible:outline-2 ${
        side === 'editor' ? 'left-2' : 'right-2'
      }`}
    >
      <RestoreIcon />
    </button>
  );
}
