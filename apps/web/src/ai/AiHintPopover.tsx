// ─────────────────────────────────────────────────────────────────────────────
// The `/a` and `/s` discovery hint (spec §The two commands and their trigger
// rules): a small graphite popover naming the one command the typed letters
// could become, acceptable with Tab, Enter, or a click. It disappears the
// moment the text stops matching — the pane renders it from the extension's
// hint state, so there is no timer and no stale menu.
// ─────────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react';
import { AI_COMMANDS } from './trigger';
import type { AiHint } from '../editor/ai-trigger';

interface AiHintPopoverProps {
  hint: AiHint;
  /** Anchored position, relative to the editor pane. */
  style: CSSProperties;
  onAccept: () => void;
}

export function AiHintPopover({ hint, style, onAccept }: AiHintPopoverProps) {
  const info = AI_COMMANDS[hint.command];
  return (
    <div
      data-testid="ai-hint"
      style={style}
      className="absolute z-20 overflow-y-auto rounded-control border border-hairline bg-surface py-1 shadow-lg"
    >
      <button
        type="button"
        // The editor keeps the caret; clicking the hint must not blur it first.
        onMouseDown={(event) => event.preventDefault()}
        onClick={onAccept}
        className="flex w-full items-baseline gap-2 px-2.5 py-1 text-left text-xs text-ink outline-offset-2 outline-accent transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-2"
      >
        <span className="font-mono font-semibold">{info.trigger}</span>
        <span className="text-ink-faint">{info.label}</span>
      </button>
    </div>
  );
}
