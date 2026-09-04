import { BookIcon, ChevronDownIcon, DownloadIcon } from './icons';
import { DocName } from './DocName';
import { ThemeToggle } from '../theme/ThemeToggle';
import type { Theme } from '../theme/theme';

interface TopBarProps {
  docName: string;
  onRename: (name: string) => void;
  theme: Theme;
  onToggleTheme: () => void;
}

export function TopBar({ docName, onRename, theme, onToggleTheme }: TopBarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline bg-surface px-3">
      <span className="select-none px-1 text-[15px] font-semibold tracking-tight">
        Perfect<span className="text-accent">Mark</span>D
      </span>

      <span aria-hidden="true" className="h-5 w-px bg-hairline" />

      <DocName name={docName} onRename={onRename} />

      <div className="ml-auto flex items-center gap-1.5">
        {/* Placeholder until the document store + Library panel (editor-app/02). */}
        <button
          type="button"
          title="Library — coming soon"
          className="flex h-8 items-center gap-1.5 rounded-control px-2.5 text-sm text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
        >
          <BookIcon />
          Library
        </button>

        <ThemeToggle theme={theme} onToggle={onToggleTheme} />

        {/* Split-button placeholder until the Client Export flow (editor-app/06). */}
        <div
          data-testid="export-split"
          title="Export — coming soon"
          className="flex items-stretch rounded-control bg-accent text-accent-ink shadow-sm"
        >
          <button
            type="button"
            className="flex h-8 items-center gap-1.5 rounded-l-control py-1 pl-3 pr-2 text-sm font-medium transition-colors duration-150 hover:bg-accent-strong"
          >
            <DownloadIcon />
            Export
          </button>
          <span aria-hidden="true" className="my-2 w-px bg-accent-ink/30" />
          <button
            type="button"
            aria-label="More export options"
            className="flex h-8 w-6 items-center justify-center rounded-r-control transition-colors duration-150 hover:bg-accent-strong"
          >
            <ChevronDownIcon />
          </button>
        </div>
      </div>
    </header>
  );
}
