import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Dialog } from './Dialog';

interface DocNameProps {
  name: string;
  onRename: (name: string) => void;
  /** Extra classes for the control — the compact top bar gives it `w-full` so
   *  it tracks the bar instead of its `size`-derived intrinsic width. */
  className?: string;
  /**
   * `inline` (default, wide): the name as a borderless inline-edit field.
   * `dialog` (compact): the bar's 111px is too little room to edit a real
   * document name in, so the control is a readout that opens a rename
   * dialog with a full-width field — same commit semantics, comfortable
   * room to type.
   */
  variant?: 'inline' | 'dialog';
}

/**
 * The document's name in the top bar. Enter or blur commits; Escape reverts;
 * empty drafts are ignored.
 */
export function DocName({
  name,
  onRename,
  className = '',
  variant = 'inline',
}: DocNameProps) {
  const [draft, setDraft] = useState(name);
  const [renaming, setRenaming] = useState(false);
  const cancelled = useRef(false);
  const fieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(name);
  }, [name]);

  /** Shared commit rule: trim, then ignore empty and unchanged drafts. */
  const commitDraft = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
  };

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(name);
      return;
    }
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) {
      onRename(trimmed);
    } else {
      setDraft(name);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      cancelled.current = true;
      event.currentTarget.blur();
    }
  };

  const openRename = () => {
    setDraft(name);
    setRenaming(true);
  };
  const closeRename = () => setRenaming(false);
  const submitRename = (event: FormEvent) => {
    event.preventDefault();
    commitDraft(draft);
    closeRename();
  };

  if (variant === 'dialog') {
    return (
      <>
        <button
          type="button"
          onClick={openRename}
          aria-haspopup="dialog"
          aria-label={`Rename document: ${name}`}
          title="Rename document"
          className={`touch-target min-w-24 max-w-full truncate rounded-control border border-transparent px-2 py-1 text-left text-sm text-ink transition-colors duration-150 outline-offset-2 outline-accent hover:border-hairline hover:text-ink focus-visible:outline-2 ${className}`}
        >
          {name}
        </button>
        {renaming && (
          <Dialog
            label="Rename document"
            testId="rename-dialog"
            backdropTestId="rename-backdrop"
            panelClassName="w-full max-w-md"
            onClose={closeRename}
          >
            <form onSubmit={submitRename} className="mt-1">
              <input
                ref={fieldRef}
                type="text"
                aria-label="Document name"
                value={draft}
                autoFocus
                onChange={(event) => setDraft(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                spellCheck={false}
                /* Full-width on purpose: room to read the name while editing
                   it is the whole reason this dialog exists. */
                className="touch-target h-9 w-full rounded-control border border-hairline bg-canvas px-2.5 text-sm text-ink outline-offset-2 outline-accent focus-visible:outline-2"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeRename}
                  className="touch-target flex h-9 items-center rounded-control border border-hairline px-3 text-sm text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="touch-target flex h-9 items-center rounded-control bg-accent-strong px-3 text-sm font-medium text-accent-ink shadow-sm transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2"
                >
                  Rename
                </button>
              </div>
            </form>
          </Dialog>
        )}
      </>
    );
  }

  return (
    <input
      ref={fieldRef}
      type="text"
      aria-label="Document name"
      title="Rename document"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      spellCheck={false}
      /* Sized to the committed name, not the draft: per-keystroke resizing
         would shift the whole top bar's right cluster while typing. */
      size={Math.max(name.length, 8)}
      /* The floor keeps the field usable when the compact bar squeezes it:
         without it flexbox shrinks the input to a sliver (min-w-0 let it
         collapse to ~18px beside Export at phone widths). touch-target
         lifts it to the 44px hit floor under coarse pointers. */
      className={`touch-target min-w-24 rounded-control border border-transparent px-2 py-1 text-sm text-ink transition-colors duration-150 outline-none placeholder:text-ink-faint hover:border-hairline focus:border-accent focus:bg-field ${className}`}
    />
  );
}
