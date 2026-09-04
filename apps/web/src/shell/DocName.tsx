import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

interface DocNameProps {
  name: string;
  onRename: (name: string) => void;
}

/**
 * The document's name as a borderless inline-edit field in the top bar.
 * Enter or blur commits; Escape reverts. Empty drafts are ignored.
 */
export function DocName({ name, onRename }: DocNameProps) {
  const [draft, setDraft] = useState(name);
  const cancelled = useRef(false);

  useEffect(() => {
    setDraft(name);
  }, [name]);

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

  return (
    <input
      type="text"
      aria-label="Document name"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      spellCheck={false}
      size={Math.max(draft.length, 8)}
      className="min-w-0 rounded-control border border-transparent px-2 py-1 text-sm text-ink transition-colors duration-150 outline-none placeholder:text-ink-faint hover:border-hairline focus:border-accent focus:bg-page"
    />
  );
}
