import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  hint: string;
}

/** Quiet placeholder shown while a pane has no content to render. */
export function EmptyState({ icon, title, hint }: EmptyStateProps) {
  return (
    <div className="flex min-h-0 flex-1 select-none flex-col items-center justify-center gap-2 p-6 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-pane border border-hairline bg-canvas text-lg text-ink-soft">
        {icon}
      </div>
      <p className="text-sm font-medium text-ink-soft">{title}</p>
      <p className="max-w-40 text-xs leading-5 text-ink-faint">{hint}</p>
    </div>
  );
}
