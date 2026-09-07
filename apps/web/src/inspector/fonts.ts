// ─────────────────────────────────────────────────────────────────────────────
// The font catalog: the font families offered in the Inspector's typography
// pickers. Everything here ships with browsers or arrives with the app — no
// third-party font services, no requests (privacy posture). Custom font
// upload is a paid feature (billing/05); Phase 1 shows it as a locked entry.
// ─────────────────────────────────────────────────────────────────────────────

export interface FontOption {
  /** CSS font-family value written into the settings. */
  css: string;
  /** Human label in the picker. */
  label: string;
  /** Group label; the picker renders one <optgroup> per group. */
  group: 'Serif' | 'Sans-serif' | 'Monospace';
}

/** The code-font picker's catalog (all monospace). */
export const CODE_FONTS: FontOption[] = [
  {
    css: "'Courier New', monospace",
    label: 'Courier New',
    group: 'Monospace',
  },
  { css: 'Consolas, monospace', label: 'Consolas', group: 'Monospace' },
  { css: 'Menlo, monospace', label: 'Menlo', group: 'Monospace' },
  { css: 'monospace', label: 'System monospace', group: 'Monospace' },
];

/** The body-font picker's catalog: the preset families plus system stacks. */
export const BODY_FONTS: FontOption[] = [
  { css: 'Georgia, serif', label: 'Georgia', group: 'Serif' },
  {
    css: "'Times New Roman', Times, serif",
    label: 'Times New Roman',
    group: 'Serif',
  },
  {
    css: "'Helvetica Neue', Helvetica, sans-serif",
    label: 'Helvetica',
    group: 'Sans-serif',
  },
  { css: 'Arial, sans-serif', label: 'Arial', group: 'Sans-serif' },
  { css: 'Inter Variable, sans-serif', label: 'Inter', group: 'Sans-serif' },
  {
    css: "system-ui, 'Segoe UI', Roboto, sans-serif",
    label: 'System sans',
    group: 'Sans-serif',
  },
];
