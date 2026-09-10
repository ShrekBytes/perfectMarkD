import { useEffect, useRef, useState } from 'react';
import { CheckIcon, CopyIcon } from '../shell/icons';

interface CopyButtonProps {
  value: string;
  /** Accessible name and tooltip; name the thing being copied. */
  label?: string;
}

/**
 * A small icon button that copies a value to the clipboard and flips to a
 * check for a moment. Wallet addresses and Reference Codes are copied by
 * hand into wallets and explorer search bars — precision is the point.
 */
export function CopyButton({ value, label = 'Copy' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onCopy = () => {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // Clipboard unavailable (blocked permissions) — leave the state alone.
      });
  };

  return (
    <>
      <button
        type="button"
        onClick={onCopy}
        aria-label={label}
        title={copied ? 'Copied' : label}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control border border-hairline text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
      <span role="status" className="sr-only">
        {copied ? 'Copied' : ''}
      </span>
    </>
  );
}
