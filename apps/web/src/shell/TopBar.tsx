import { BookIcon } from './icons';
import { AccountMenu } from './AccountMenu';
import { DocName } from './DocName';
import { QuotaChip } from './QuotaChip';
import { ShellMenu } from './ShellMenu';
import { ThemeToggle } from '../theme/ThemeToggle';
import { ExportSplitButton } from '../export/ExportSplitButton';
import type { Theme } from '../theme/theme';
import type { SaveState } from '../documents/store';
import type { ShellMode } from './pane-layout';

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
  /** The shell's layout mode. Compact folds the secondary cluster — Library,
   *  theme, quota, account — into the overflow menu and hands the autosave
   *  readout to the switcher row, so the bar can hold the document name and
   *  the Export action at phone widths. */
  mode: ShellMode;
}

/** The wordmark: the workspace's top-level heading. */
function Wordmark() {
  return (
    <h1 className="select-none px-1 text-[15px] font-semibold tracking-tight">
      Perfect<span className="font-mono">Mark</span>D
    </h1>
  );
}

/** The hairline that separates the wordmark from the document name. */
function WordmarkRule() {
  return <span aria-hidden="true" className="h-5 w-px bg-hairline" />;
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
  mode,
}: TopBarProps) {
  const compact = mode === 'compact';

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline bg-surface px-3">
      {compact ? (
        <>
          {/* The wordmark needs ~104px of the bar. Below 480px the document
              name and the Export action own that space instead — the brand
              still heads the page (h1 text, document title, Library). */}
          <span className="hidden items-center gap-2 roomy:flex">
            <Wordmark />
            <WordmarkRule />
          </span>
          <div className="flex min-w-0 flex-1 items-center">
            <DocName name={docName} onRename={onRename} className="w-full" />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <ShellMenu
              onOpenLibrary={onOpenLibrary}
              theme={theme}
              onToggleTheme={onToggleTheme}
              onOpenUpgradeStatus={onOpenUpgradeStatus}
              onOpenHistory={onOpenHistory}
            />
            {/* The primary action stays in the bar at every width — it never
                hides behind the overflow. */}
            <ExportSplitButton />
          </div>
        </>
      ) : (
        <>
          <Wordmark />
          <WordmarkRule />
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
              className="touch-target flex h-8 items-center gap-1.5 rounded-control px-2.5 text-sm text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
            >
              <BookIcon />
              Library
            </button>

            <ThemeToggle theme={theme} onToggle={onToggleTheme} />

            {/* Quota chip (server/04): usage against the active plan's monthly
                Server Export allowance; absent on Free. Compact drops the
                standalone chip — the Export menu's Server Export item carries
                the same count. */}
            <QuotaChip />

            {/* Client Export flow (editor-app/06): self-contained split button —
                print flow, one-time hint, and toasts all live inside it. */}
            <ExportSplitButton />

            <AccountMenu
              onOpenUpgradeStatus={onOpenUpgradeStatus}
              onOpenHistory={onOpenHistory}
            />
          </div>
        </>
      )}
    </header>
  );
}
