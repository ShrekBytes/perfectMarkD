// ─────────────────────────────────────────────────────────────────────────────
// Inspector → Stylesheet tab (ai-transforms/01): the Custom Stylesheet's home
// — the CSS box (monospace, its own scroll, roughly the top half; the AI
// conversation lands below it in ai-transforms/06) with the layer's on/off
// state, and the plain statement that page geometry belongs to the Page tab.
// Without the entitlement the body says what the plan includes and opens the
// pricing modal — never a signup wall.
// ─────────────────────────────────────────────────────────────────────────────

import { GateLock, ToggleRow } from './controls';
import {
  editStylesheet,
  setStylesheetEnabled,
  stylesheetHasCSS,
} from './settings-edit';
import type { TabProps } from './controls';

export function StylesheetTab({
  settings,
  set,
  onOpenPricing,
  flags,
}: TabProps) {
  if (!flags.customStylesheet) {
    return (
      <div className="px-3 py-3">
        <p className="text-xs leading-5 text-ink-soft">
          The Custom Stylesheet is part of Pro and Premium: your own CSS,
          layered over any Preset — in the preview and in every export.
        </p>
        <div className="mt-3">
          {/* The Gate Lock chip (DESIGN.md): the click opens the pricing
              modal, never a signup wall. */}
          <GateLock onClick={onOpenPricing} label="Custom stylesheet" />
        </div>
      </div>
    );
  }

  const hasCSS = stylesheetHasCSS(settings);

  return (
    <div className="flex h-full min-h-0 flex-col px-3 py-3">
      {/* Roughly the top half (the AI block below it arrives with
          ai-transforms/06): its own scroll, so a long stylesheet never
          pushes the state row out of view. A native textarea — selection,
          undo, and paste are the platform's, not ours. */}
      <div className="flex min-h-32 grow basis-1/2 flex-col">
        <textarea
          aria-label="Custom stylesheet"
          data-testid="stylesheet-box"
          value={settings.customStylesheet}
          onChange={(event) =>
            set(editStylesheet(settings, event.target.value))
          }
          spellCheck={false}
          placeholder={'/* Your own CSS, layered over the generated rules */'}
          className="min-h-0 w-full flex-1 resize-y rounded-control border border-hairline bg-field px-2 py-1.5 font-mono text-xs text-ink transition-colors duration-150 outline-none focus:border-accent"
        />
      </div>

      <div className="shrink-0 pt-1">
        <ToggleRow
          checked={settings.customStylesheetEnabled}
          onChange={(on) => set(setStylesheetEnabled(settings, on))}
          label="Apply to pages"
          disabled={!hasCSS}
        />
        {/* The guardrail, in the box's own voice: geometry is a Page-tab
            setting, and an obeyed-in-print-only @page rule would silently
            split preview from print — so the engine strips them. */}
        <p className="text-[11px] leading-4 text-ink-faint">
          Page size and margins are Page-tab settings; @page rules are ignored.
        </p>
      </div>
    </div>
  );
}
