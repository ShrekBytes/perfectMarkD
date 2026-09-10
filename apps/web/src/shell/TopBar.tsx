import { BookIcon } from './icons';
import { AccountMenu } from './AccountMenu';
import { DocName } from './DocName';
import { ThemeToggle } from '../theme/ThemeToggle';
import { ExportSplitButton } from '../export/ExportSplitButton';
import type { Theme } from '../theme/theme';
import type { SaveState } from '../documents/store';

interface TopBarProps {
  docName: string;
  onRename: (name: string) => void;
  /** Autosave affordance; null hides the indicator (no active document). */
  saveState: SaveState | null;
  libraryOpen: boolean;
  onOpenLibrary: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  /** Opens the Upgrade status dialog (billing/01). */
  onOpenUpgradeStatus: () => void;
}

export function TopBar({
  docName,
  onRename,
  saveState,
  libraryOpen,
  onOpenLibrary,
  theme,
  onToggleTheme,
  onOpenUpgradeStatus,
}: TopBarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline bg-surface px-3">
      <span className="select-none px-1 text-[15px] font-semibold tracking-tight">
        Perfect<span className="text-accent">Mark</span>D
      </span>

      <span aria-hidden="true" className="h-5 w-px bg-hairline" />

      <DocName name={docName} onRename={onRename} />
      {saveState && (
        <span
          aria-live="polite"
          data-testid="save-state"
          className="select-none text-xs text-ink-faint"
        >
          {saveState === 'saving' ? 'Saving…' : 'Saved'}
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

        {/* Client Export flow (editor-app/06): self-contained split button —
            print flow, one-time hint, and toasts all live inside it. */}
        <ExportSplitButton />

        <AccountMenu onOpenUpgradeStatus={onOpenUpgradeStatus} />
      </div>
    </header>
  );
}
