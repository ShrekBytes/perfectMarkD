import { BookIcon } from './icons';
import { AccountMenu } from './AccountMenu';
import { DocName } from './DocName';
import { QuotaChip } from './QuotaChip';
import { ThemeToggle } from '../theme/ThemeToggle';
import { ExportSplitButton } from '../export/ExportSplitButton';
import type { Theme } from '../theme/theme';
import type { SaveState } from '../documents/store';

interface TopBarProps {
  docName: string;
  onRename: (name: string) => void;
  /** Autosave affordance; null hides the indicator (no active document). */
  saveState: SaveState | null;
  /** The proofing gauge: the document's paper facts ("A4 · 12 pages"),
   *  or null when no document is active. A readout, not a control. */
  gauge: string | null;
  libraryOpen: boolean;
  onOpenLibrary: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  /** Opens the Upgrade status dialog (billing/01). */
  onOpenUpgradeStatus: () => void;
  /** Opens the Export History dialog (server/05). */
  onOpenHistory: () => void;
}

export function TopBar({
  docName,
  onRename,
  saveState,
  gauge,
  libraryOpen,
  onOpenLibrary,
  theme,
  onToggleTheme,
  onOpenUpgradeStatus,
  onOpenHistory,
}: TopBarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline bg-surface px-3">
      {/* h1: the wordmark is the workspace's top-level heading (critique:
          heading order previously started at h2 inside drawers). */}
      <h1 className="select-none px-1 text-[15px] font-semibold tracking-tight">
        Perfect<span className="text-accent">Mark</span>D
      </h1>

      <span aria-hidden="true" className="h-5 w-px bg-hairline" />

      <DocName name={docName} onRename={onRename} />
      {saveState && (
        <span
          aria-live="polite"
          data-testid="save-state"
          /* Fixed minimum width: Saving… and Saved are different lengths, and
             a shifting readout would nudge the whole right cluster. */
          className="inline-block min-w-14 text-left select-none text-xs text-ink-faint"
        >
          {saveState === 'saving' ? 'Saving…' : 'Saved'}
        </span>
      )}
      {gauge && (
        <span
          data-testid="proof-gauge"
          className="select-none whitespace-nowrap text-xs text-ink-faint tabular-nums"
        >
          {gauge}
        </span>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenLibrary}
          aria-expanded={libraryOpen}
          title="Library"
          className="flex h-8 items-center gap-1.5 rounded-control px-2.5 text-sm text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
        >
          <BookIcon />
          Library
        </button>

        <ThemeToggle theme={theme} onToggle={onToggleTheme} />

        {/* Quota chip (server/04): usage against the active plan's monthly
            Server Export allowance; absent on Free. */}
        <QuotaChip />

        {/* Client Export flow (editor-app/06): self-contained split button —
            print flow, one-time hint, and toasts all live inside it. */}
        <ExportSplitButton />

        <AccountMenu
          onOpenUpgradeStatus={onOpenUpgradeStatus}
          onOpenHistory={onOpenHistory}
        />
      </div>
    </header>
  );
}
