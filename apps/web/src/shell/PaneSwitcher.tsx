import type { CompactPane } from './pane-layout';

/** The three workspace views, named as the panes are named everywhere else. */
const ITEMS: { id: CompactPane; label: string }[] = [
  { id: 'editor', label: 'Editor' },
  { id: 'canvas', label: 'Paper' },
  { id: 'inspector', label: 'Inspector' },
];

interface PaneSwitcherProps {
  value: CompactPane;
  onChange: (pane: CompactPane) => void;
}

/**
 * The compact workspace's view switcher. Below `SHELL_WIDE_MIN` the three-pane
 * row cannot fit its own minimum widths, so the panes stop being columns and
 * become views: one at a time, full width, chosen by an always-visible name.
 * This replaces the desktop dividers' hover-revealed chevrons — invisible on
 * touch, and the only way to reach the canvas on a phone.
 *
 * The segmented treatment mirrors the Inspector's tablist (canvas fill plus a
 * hairline for the active item, transparent border elsewhere so selecting one
 * shifts no layout) at a touch-sized 32px height.
 */
export function PaneSwitcher({ value, onChange }: PaneSwitcherProps) {
  return (
    <div
      role="group"
      aria-label="Workspace view"
      data-testid="pane-switcher"
      className="flex items-center gap-1"
    >
      {ITEMS.map(({ id, label }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            data-testid={`pane-switcher-${id}`}
            onClick={() => onChange(id)}
            className={`touch-target flex h-8 items-center rounded-control border px-2.5 text-xs transition-colors duration-150 outline-offset-2 outline-accent focus-visible:outline-2 ${
              active
                ? 'border-hairline bg-canvas font-semibold text-ink'
                : 'border-transparent font-medium text-ink-soft hover:bg-surface-hover hover:text-ink'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
