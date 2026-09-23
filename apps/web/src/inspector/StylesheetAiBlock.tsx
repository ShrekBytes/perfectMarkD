// ─────────────────────────────────────────────────────────────────────────────
// The AI block of the Stylesheet tab (ai-transforms/06): a conversation under
// the CSS box. Each reply is a proposal card — the stylesheet diff, Accept, and
// Reject — and every turn stays in the log, decided or not, because "not like
// that — try it with a thinner rule" only means something if the turn it refers
// to is still there. Accept writes the box; Reject leaves it exactly as it was;
// the box is what every request sends, so a hand edit is never overwritten by
// stale context.
//
// The block states its own condition, because the box works whether or not AI
// does: locked (AI Actions are not in the plan), off (the user's own switch,
// with a way back), unavailable (a plain message with Retry, naming nothing
// about the provider), exhausted (the count, the period, the reset date), and
// ready. On an instance with no provider configured it renders nothing at all —
// there is no command to offer (spec §Gate precedence, step 1).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { errorToMessage } from '../api/client';
import { useAccountStore, useAiState } from '../auth/account-store';
import { AiDiff } from '../ai/AiDiff';
import { FirstUseNotice } from '../ai/FirstUseNotice';
import { periodLabel, resetDate } from '../ai/format';
import {
  buildChangeSet,
  isProposalStale,
  stylesheetTarget,
} from '../ai/proposal';
import { useStylesheetChat } from '../ai/useStylesheetChat';
import type { StylesheetTurn } from '../ai/conversation';

interface StylesheetAiBlockProps {
  /** The active Document; its conversation is its own. */
  docId: string | null;
  /** The box as it stands — what a request sends, and the staleness baseline. */
  css: string;
  /** Writes an accepted proposal into the box. */
  onApply: (css: string) => void;
  onOpenPricing: () => void;
}

/** The section's own heading, in the Inspector's section voice. */
function Heading() {
  return (
    <h2 className="mb-1 shrink-0 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
      AI
    </h2>
  );
}

const ACTION_BUTTON =
  'touch-target inline-flex h-7 items-center rounded-control px-2 text-xs font-medium outline-offset-2 outline-accent transition-colors duration-150 focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40';

const SECONDARY_BUTTON = `${ACTION_BUTTON} border border-hairline bg-canvas text-ink hover:bg-surface-hover`;

export function StylesheetAiBlock({
  docId,
  css,
  onApply,
  onOpenPricing,
}: StylesheetAiBlockProps) {
  const ai = useAiState();
  const setAiAccess = useAccountStore((state) => state.setAiAccess);
  const chat = useStylesheetChat(docId, css, onApply);
  const [instruction, setInstruction] = useState('');
  const [accessError, setAccessError] = useState<string | null>(null);
  const [turningOn, setTurningOn] = useState(false);

  // Step 1 of the gate order: nothing here at all. Advertising a feature the
  // operator cannot serve is worse than not having it.
  if (!ai?.configured) return null;

  const turnOn = () => {
    setAccessError(null);
    setTurningOn(true);
    void setAiAccess(true)
      .catch((cause: unknown) => setAccessError(errorToMessage(cause)))
      .finally(() => setTurningOn(false));
  };

  const submit = () => {
    const trimmed = instruction.trim();
    if (trimmed === '' || chat.busy) return;
    setInstruction('');
    chat.send(trimmed);
  };

  return (
    <section
      aria-label="AI stylesheet conversation"
      data-testid="stylesheet-ai"
      className="mt-2 flex min-h-40 min-w-0 grow basis-1/2 flex-col border-t border-hairline pt-2"
    >
      <Heading />

      {!ai.included ? (
        <div data-testid="stylesheet-ai-locked">
          <p className="text-xs leading-5 text-ink-soft">
            AI Actions are part of Pro and Premium. The CSS box above is yours
            either way.
          </p>
          <p className="mt-1 text-[11px] leading-4 text-ink-faint">
            AI Actions send the text you submit to an external AI provider.
          </p>
          <button
            type="button"
            onClick={onOpenPricing}
            className={`${SECONDARY_BUTTON} mt-2`}
          >
            See plans
          </button>
        </div>
      ) : !ai.access ? (
        <div data-testid="stylesheet-ai-off">
          <p className="text-xs leading-5 text-ink-soft">
            AI is turned off in your Account settings.
          </p>
          <button
            type="button"
            onClick={turnOn}
            disabled={turningOn}
            className={`${SECONDARY_BUTTON} mt-2`}
          >
            Turn on
          </button>
          {accessError && (
            <p role="alert" className="mt-1 text-[11px] leading-4 text-danger">
              {accessError}
            </p>
          )}
        </div>
      ) : ai.remaining <= 0 ? (
        <div data-testid="stylesheet-ai-exhausted">
          <p className="text-xs leading-5 text-ink-soft">
            You have used all {ai.allowance} AI Actions for{' '}
            {periodLabel(ai.period)}. They reset on {resetDate(ai.resetsAt)}.
          </p>
          <button
            type="button"
            onClick={onOpenPricing}
            className={`${SECONDARY_BUTTON} mt-2`}
          >
            See plans
          </button>
        </div>
      ) : (
        <>
          <ol
            aria-label="Conversation"
            data-testid="stylesheet-ai-log"
            className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1"
          >
            {chat.turns.map((turn) => (
              <Turn
                key={turn.id}
                turn={turn}
                css={css}
                busy={chat.busy}
                onDecide={chat.decide}
                onRetry={chat.retry}
              />
            ))}
          </ol>

          <div className="mt-2 shrink-0">
            {!ai.disclosureSeen && <FirstUseNotice />}
            <textarea
              aria-label="Describe the look"
              data-testid="stylesheet-ai-input"
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              rows={2}
              placeholder="Describe the look — thinner rules, a warmer accent…"
              className="mt-2 w-full resize-y rounded-control border border-hairline bg-field px-2 py-1.5 text-xs text-ink outline-none transition-colors duration-150 focus:border-accent"
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="text-[11px] leading-4 text-ink-faint">
                {chat.busy
                  ? 'Working…'
                  : 'Enter to send · Shift+Enter for a line'}
              </p>
              <div className="flex items-center gap-1">
                {chat.busy && (
                  <button
                    type="button"
                    data-testid="stylesheet-ai-cancel"
                    onClick={chat.cancel}
                    className={`${ACTION_BUTTON} text-ink-soft hover:bg-surface-hover hover:text-ink`}
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  data-testid="stylesheet-ai-send"
                  onClick={submit}
                  disabled={chat.busy || instruction.trim() === ''}
                  className={`${ACTION_BUTTON} bg-accent-strong text-accent-ink hover:bg-accent-deep`}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

interface TurnProps {
  turn: StylesheetTurn;
  /** The box as it stands, for the staleness check. */
  css: string;
  busy: boolean;
  onDecide: (turnId: number, decision: 'accepted' | 'rejected') => void;
  onRetry: (turnId: number) => void;
}

function Turn({ turn, css, busy, onDecide, onRetry }: TurnProps) {
  return (
    <li
      data-testid="stylesheet-ai-turn"
      className="border-t border-hairline pt-2 first:border-t-0 first:pt-0"
    >
      <p className="text-xs leading-5 text-ink">{turn.instruction}</p>

      {turn.status === 'working' && (
        <p className="mt-1 text-[11px] leading-4 text-ink-faint">Working…</p>
      )}

      {turn.status === 'failed' && (
        <>
          <p
            role="alert"
            data-testid="stylesheet-ai-error"
            className="mt-1 text-[11px] leading-4 text-danger"
          >
            {turn.error}
          </p>
          <button
            type="button"
            onClick={() => onRetry(turn.id)}
            disabled={busy}
            className={`${SECONDARY_BUTTON} mt-1`}
          >
            Retry
          </button>
        </>
      )}

      {turn.status === 'proposal' && (
        <ProposalCard turn={turn} css={css} onDecide={onDecide} />
      )}
    </li>
  );
}

function ProposalCard({
  turn,
  css,
  onDecide,
}: {
  turn: Extract<StylesheetTurn, { status: 'proposal' }>;
  css: string;
  onDecide: (turnId: number, decision: 'accepted' | 'rejected') => void;
}) {
  // A stylesheet reply is a whole-CSS replacement: one change, whose "before"
  // is the box as it stood when the request went out.
  const target = stylesheetTarget(turn.against);
  const changeSet = buildChangeSet(target, {
    kind: 'replace',
    text: turn.reply,
  });
  const stale = isProposalStale(target, css);

  return (
    <div data-testid="stylesheet-ai-proposal" className="mt-1">
      {changeSet.changes.map((change) => (
        <AiDiff key={change.id} change={change} />
      ))}

      {turn.decision ? (
        <p
          data-testid="stylesheet-ai-decision"
          className="mt-1 text-[11px] leading-4 text-ink-faint"
        >
          {turn.decision === 'accepted'
            ? 'Accepted — written to the box.'
            : 'Rejected — the box is unchanged.'}
        </p>
      ) : (
        <>
          {stale && (
            <p
              role="status"
              data-testid="stylesheet-ai-stale"
              className="mt-1 text-[11px] leading-4 text-danger"
            >
              The stylesheet changed since this was proposed — ask again to use
              it.
            </p>
          )}
          <div className="mt-1 flex items-center gap-1">
            <button
              type="button"
              data-testid="stylesheet-ai-accept"
              onClick={() => onDecide(turn.id, 'accepted')}
              disabled={stale}
              className={`${ACTION_BUTTON} bg-accent-strong text-accent-ink hover:bg-accent-deep`}
            >
              Accept
            </button>
            <button
              type="button"
              data-testid="stylesheet-ai-reject"
              onClick={() => onDecide(turn.id, 'rejected')}
              className={SECONDARY_BUTTON}
            >
              Reject
            </button>
          </div>
        </>
      )}
    </div>
  );
}
