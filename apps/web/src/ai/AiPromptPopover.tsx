// ─────────────────────────────────────────────────────────────────────────────
// The `/ai` / `/ss` prompt popup (spec §The two commands and their trigger
// rules). A graphite panel anchored below the caret inside the editor pane:
// the prompt field, the resolved AI Scope with its size readout, and the
// command's own state — ready, locked (not entitled), exhausted, working, or a
// failed request. Focus returns to the caret on close (the editor keeps
// working while a request runs; Cancel aborts it).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AiScope } from '@perfectmarkd/core';
import { Link } from '../router';
import { useEscapeLayer } from '../shell/focus';
import { AI_COMMANDS } from './trigger';
import { periodLabel, resetDate } from './format';
import type { AiAccountState, AiCommand } from './types';

/** The command's own gate state, resolved from the account block. */
export type AiPromptGate = 'ready' | 'not_entitled' | 'exhausted';

export type AiRequestState =
  | { status: 'idle' }
  | { status: 'working' }
  | { status: 'error'; message: string };

interface AiPromptPopoverProps {
  command: AiCommand;
  scope: AiScope;
  ai: AiAccountState;
  gate: AiPromptGate;
  request: AiRequestState;
  /** The prompt to open with — set when the user came back via "Edit prompt". */
  initialInstruction?: string;
  /** Anchored position, relative to the editor pane. */
  style: CSSProperties;
  onSubmit: (instruction: string) => void;
  onCancel: () => void;
  onOpenPricing: () => void;
}

/**
 * The one-line disclosure (spec §First-use disclosure): shown until the account
 * has recorded it, on the first AI Action only. It is a notice, not a gate —
 * the request still proceeds.
 */
function firstUseNotice() {
  return (
    <p className="mt-2 text-[11px] leading-4 text-ink-faint">
      Your text is sent to an external AI provider for this action.{' '}
      <Link
        to="/privacy"
        onClick={(event) => event.stopPropagation()}
        className="font-medium text-ink underline decoration-hairline underline-offset-2 outline-offset-2 outline-accent hover:decoration-ink focus-visible:outline-2"
      >
        How your data is handled
      </Link>
    </p>
  );
}

/** The AI Scope readout: which part of the Document, and how big. */
function scopeReadout(scope: AiScope, cap: number) {
  const overCap = scope.size.characters > cap;
  return (
    <p className="mt-0.5 text-[11px] leading-4 text-ink-soft">
      {scope.kind === 'selection' ? 'Selection' : 'Whole document'} ·{' '}
      <span className="font-mono tabular-nums">
        {scope.size.characters.toLocaleString('en-US')}
      </span>{' '}
      of{' '}
      <span className="font-mono tabular-nums">
        {cap.toLocaleString('en-US')}
      </span>{' '}
      characters
      {overCap && (
        <span className="text-danger">
          {' '}
          — too big for one AI Action; select a smaller range.
        </span>
      )}
    </p>
  );
}

export function AiPromptPopover({
  command,
  scope,
  ai,
  gate,
  request,
  initialInstruction = '',
  style,
  onSubmit,
  onCancel,
  onOpenPricing,
}: AiPromptPopoverProps) {
  const [instruction, setInstruction] = useState(initialInstruction);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Escape cancels; registered as a layer so a review dialog above it wins.
  useEscapeLayer(true, onCancel);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const working = request.status === 'working';
  const info = AI_COMMANDS[command];

  const submit = () => {
    const trimmed = instruction.trim();
    if (trimmed === '' || working) return;
    onSubmit(trimmed);
  };

  return (
    <div
      data-testid="ai-prompt"
      role="dialog"
      aria-label={`AI · ${info.label}`}
      style={style}
      className="absolute z-30 w-80 max-w-[calc(100%-1rem)] overflow-y-auto rounded-pane border border-hairline bg-surface p-3 shadow-xl"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-mono text-xs font-semibold text-ink">
          {info.trigger}
          <span className="ml-2 font-sans font-normal text-ink-faint">
            {info.label}
          </span>
        </h2>
      </div>

      <div className="mt-2">{scopeReadout(scope, ai.maxInputCharacters)}</div>

      {gate === 'not_entitled' ? (
        <div className="mt-2">
          <p className="text-xs leading-5 text-ink-soft">
            AI Actions are part of Pro and Premium. Your Document stays in the
            browser until you accept the result.
          </p>
          <p className="mt-2 text-[11px] leading-4 text-ink-faint">
            AI Actions send the text you submit to an external AI provider.
          </p>
          <button
            type="button"
            onClick={onOpenPricing}
            className="touch-target mt-3 inline-flex h-8 items-center rounded-control border border-hairline bg-canvas px-3 text-xs font-medium text-ink outline-offset-2 outline-accent transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-2"
          >
            See plans
          </button>
        </div>
      ) : gate === 'exhausted' ? (
        <div className="mt-2">
          <p className="text-xs leading-5 text-ink-soft">
            You have used all {ai.allowance} AI Actions for{' '}
            {periodLabel(ai.period)}. They reset on {resetDate(ai.resetsAt)}.
          </p>
          <button
            type="button"
            onClick={onOpenPricing}
            className="touch-target mt-3 inline-flex h-8 items-center rounded-control border border-hairline bg-canvas px-3 text-xs font-medium text-ink outline-offset-2 outline-accent transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-2"
          >
            See plans
          </button>
        </div>
      ) : (
        <>
          <textarea
            ref={inputRef}
            aria-label="Describe the change"
            data-testid="ai-prompt-input"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.stopPropagation();
                submit();
              }
            }}
            rows={3}
            disabled={working}
            placeholder="Describe the change…"
            className="mt-2 w-full resize-y rounded-control border border-hairline bg-field px-2 py-1.5 text-xs text-ink outline-none transition-colors duration-150 focus:border-accent disabled:opacity-60"
          />

          {!ai.disclosureSeen && firstUseNotice()}

          {request.status === 'error' && (
            <p role="alert" className="mt-2 text-[11px] leading-4 text-danger">
              {request.message}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-[11px] leading-4 text-ink-faint">
              {working ? 'Working…' : 'Enter to send · Shift+Enter for a line'}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="touch-target inline-flex h-8 items-center rounded-control px-2 text-xs font-medium text-ink-soft outline-offset-2 outline-accent transition-colors duration-150 hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
              >
                {working ? 'Cancel' : 'Close'}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={working || instruction.trim() === ''}
                className="touch-target inline-flex h-8 items-center rounded-control bg-accent-strong px-3 text-xs font-medium text-accent-ink outline-offset-2 outline-accent transition-colors duration-150 hover:bg-accent-deep focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {request.status === 'error' ? 'Retry' : 'Send'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
