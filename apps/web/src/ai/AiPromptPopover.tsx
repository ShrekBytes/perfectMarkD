// ─────────────────────────────────────────────────────────────────────────────
// The `/ai` / `/ss` prompt popup (spec §The two commands and their trigger
// rules). A graphite panel anchored below the caret inside the editor pane:
// the prompt field, the resolved AI Scope with its size readout, and the
// command's own state — ready, locked (not entitled), exhausted, working, or a
// failed request. Focus returns to the caret on close (the editor keeps
// working while a request runs; Cancel aborts it).
//
// The size ladder decides what the ready state offers (ai-transforms/07,
// spec §Scope, the size ladder): everything, the target plus an outline of the
// rest, an AI Plan for a Document too large for one action, or a refusal that
// states the size, the cap, and the paragraph around the caret as the way
// forward. Nothing here ever sends a truncated target.
// ─────────────────────────────────────────────────────────────────────────────

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import type { AiLadderDecision, AiScope } from '@perfectmarkd/core';
import { useEscapeLayer } from '../shell/focus';
import { AI_COMMANDS } from './trigger';
import { FirstUseNotice } from './FirstUseNotice';
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
  /** The size ladder's decision; null for `/ss`, which has no ladder. */
  ladder: AiLadderDecision | null;
  request: AiRequestState;
  /** The prompt to open with — set when the user came back via "Edit prompt". */
  initialInstruction?: string;
  /** Anchored position, relative to the editor pane. */
  style: CSSProperties;
  /** Element the popup was opened from (the toolbar button), if any. A press
   *  on it is not an outside click: the button toggles the popup itself. */
  anchorRef?: RefObject<HTMLElement | null>;
  onSubmit: (instruction: string) => void;
  /** Asks for an AI Plan, for a Document too large for one action. */
  onPlan: (instruction: string) => void;
  /** Works on the paragraph around the caret instead of the refused target. */
  onUseParagraphRange: () => void;
  onCancel: () => void;
  /** An outside press (not on the panel or the anchor) asked to close. */
  onDismiss?: () => void;
  onOpenPricing: () => void;
}

const BUTTON =
  'touch-target inline-flex h-8 items-center rounded-control border border-hairline bg-canvas px-3 text-xs font-medium text-ink outline-offset-2 outline-accent transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-2';

/**
 * The AI Scope readout: which part of the Document, and how big. `/ss` targets
 * the Custom Stylesheet rather than a range, so it names that instead. The
 * over-cap flag is only for a scope the ladder has not judged — when it has,
 * its own refusal states the size and the cap better.
 */
function scopeReadout(
  command: AiCommand,
  scope: AiScope,
  cap: number,
  flagOverCap: boolean,
) {
  const overCap = flagOverCap && scope.size.characters > cap;
  return (
    <p className="mt-0.5 text-[11px] leading-4 text-ink-soft">
      {command === 'stylesheet'
        ? 'Custom stylesheet'
        : scope.kind === 'selection'
          ? 'Selection'
          : 'Whole document'}{' '}
      ·{' '}
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

/** One line of the ladder's own words, under the scope readout. */
function LadderNote({ children }: { children: ReactNode }) {
  return (
    <p
      data-testid="ai-ladder"
      className="mt-1 text-[11px] leading-4 text-ink-faint"
    >
      {children}
    </p>
  );
}

/**
 * What the ladder decided, in plain words: what will be sent, what an AI Plan
 * would cost, or why nothing can run (spec §Tier 1 and §Tier 2).
 */
function ladderLine(
  decision: AiLadderDecision,
  scope: AiScope,
  onUseParagraphRange: () => void,
) {
  if (decision.tier === 0) {
    return decision.context === null ? null : (
      <LadderNote>
        The rest of the document is sent with it, so the result matches the
        document it belongs to.
      </LadderNote>
    );
  }
  if (decision.tier === 1) {
    return (
      <LadderNote>
        {decision.otherSections === 0
          ? // One section holds the whole Document: there is no rest to
            // digest, so the selection is all that is sent.
            'Only this selection is sent: the rest of the document is too large to send with it.'
          : `Only part of the document is sent: this selection in full, plus an outline of the other ${decision.otherSections} ${decision.otherSections === 1 ? 'section' : 'sections'}.`}
      </LadderNote>
    );
  }
  if (decision.tier === 2) {
    return (
      <LadderNote>
        Too large for one AI Action. An AI Plan works through it one section at
        a time: one AI Action builds the plan, you approve the steps, and each
        step is then its own AI Action.
      </LadderNote>
    );
  }
  // Tier 3: refused, with the paragraph around the caret offered when the
  // target is not already that paragraph.
  const range = decision.paragraphRange;
  const alreadyParagraph =
    range !== null && range.from === scope.from && range.to === scope.to;
  return (
    <div className="mt-1">
      <p
        role="status"
        data-testid="ai-ladder-refusal"
        className="text-[11px] leading-4 text-danger"
      >
        {decision.refusal.message}
      </p>
      {range !== null && !alreadyParagraph && (
        <button
          type="button"
          onClick={onUseParagraphRange}
          className={`${BUTTON} mt-2`}
        >
          Work on the paragraph around your cursor
        </button>
      )}
    </div>
  );
}

export function AiPromptPopover({
  command,
  scope,
  ai,
  gate,
  ladder,
  request,
  initialInstruction = '',
  style,
  anchorRef,
  onSubmit,
  onPlan,
  onUseParagraphRange,
  onCancel,
  onDismiss = () => {},
  onOpenPricing,
}: AiPromptPopoverProps) {
  const [instruction, setInstruction] = useState(initialInstruction);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Escape cancels; registered as a layer so a review dialog above it wins.
  useEscapeLayer(true, onCancel);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const working = request.status === 'working';

  // An outside press closes the popup — whether it was opened by the toolbar
  // button or by a typed `/ai`/`/ss`. Presses inside the panel are the popup
  // working, and a press on the anchor is the button toggling it, so neither
  // counts. While a request is running the popup is that Action's progress
  // surface, so only Cancel (or Esc) ends the run; dismissal is inert.
  useEffect(() => {
    if (working) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef?.current?.contains(target)) return;
      onDismiss();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [anchorRef, onDismiss, working]);

  const info = AI_COMMANDS[command];
  // A refused target has nothing to run: the popup states why and offers the
  // paragraph instead of a Send button that could only fail.
  const refused = ladder !== null && ladder.tier === 3;
  const plans = ladder !== null && ladder.tier === 2;

  const submit = () => {
    const trimmed = instruction.trim();
    if (trimmed === '' || working || refused) return;
    if (plans) onPlan(trimmed);
    else onSubmit(trimmed);
  };

  return (
    <div
      ref={panelRef}
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

      <div className="mt-2">
        {scopeReadout(command, scope, ai.maxInputCharacters, ladder === null)}
      </div>

      {ladder !== null && ladderLine(ladder, scope, onUseParagraphRange)}

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
            className={`${BUTTON} mt-3`}
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
            className={`${BUTTON} mt-3`}
          >
            See plans
          </button>
        </div>
      ) : refused ? (
        <div className="mt-3 flex items-center justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="touch-target inline-flex h-8 items-center rounded-control px-2 text-xs font-medium text-ink-soft outline-offset-2 outline-accent transition-colors duration-150 hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
          >
            Close
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

          {!ai.disclosureSeen && <FirstUseNotice />}

          {request.status === 'error' && (
            <p role="alert" className="mt-2 text-[11px] leading-4 text-danger">
              {request.message}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-[11px] leading-4 text-ink-faint">
              {working
                ? 'Working…'
                : plans
                  ? 'Enter to plan · Shift+Enter for a line'
                  : 'Enter to send · Shift+Enter for a line'}
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
                {plans
                  ? 'Plan the changes'
                  : request.status === 'error'
                    ? 'Retry'
                    : 'Send'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
