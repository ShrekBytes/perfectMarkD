// ─────────────────────────────────────────────────────────────────────────────
// The Stylesheet tab's AI conversation (ai-transforms/06): one AI Action per
// turn, against the box as it stands, replayed with the last few turns.
//
// The log lives in the conversation store (per Document, session-scoped), so
// the block renders it and this hook only drives it: a send appends a turn and
// settles it with the reply or a plain failure; an accept writes the box
// through the same settings path a hand edit uses, and a reject leaves the box
// exactly as it was. Both decisions stay in the log, because "not like that —
// try it this way" only means something if the turn it refers to is still
// there.
//
// One request at a time, with a Cancel that aborts it: the request is a single
// POST, so there is nothing to stream into, and a cancelled request produced
// nothing and cost nothing — it leaves no trace in the log.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef } from 'react';
import { errorToMessage } from '../api/client';
import { useAccountStore } from '../auth/account-store';
import { requestStylesheet } from './api';
import {
  recentExchanges,
  turnsFor,
  useStylesheetConversation,
  useStylesheetTurns,
  type StylesheetDecision,
  type StylesheetTurn,
} from './conversation';
import { applyProposal, isProposalStale, stylesheetTarget } from './proposal';

export interface StylesheetChat {
  turns: StylesheetTurn[];
  /** A turn is in flight. */
  busy: boolean;
  /** Runs one AI Action for the instruction, as a new turn. */
  send(instruction: string): void;
  /** Retry: a fresh AI Action with the same instruction. */
  retry(turnId: number): void;
  /** Accept writes the box; Reject leaves it untouched. */
  decide(turnId: number, decision: StylesheetDecision): void;
  /** Aborts the request in flight; the turn it was running is dropped. */
  cancel(): void;
}

/**
 * @param docId   the active Document; its log is its own.
 * @param css     the box as it stands now — what every request sends.
 * @param onApply writes an accepted proposal into the box.
 */
export function useStylesheetChat(
  docId: string | null,
  css: string,
  onApply: (css: string) => void,
): StylesheetChat {
  const turns = useStylesheetTurns(docId);
  // Read through refs: a request or a decision must see the box and the writer
  // as they are when it runs, not as they were when it was created.
  const cssRef = useRef(css);
  cssRef.current = css;
  const applyRef = useRef(onApply);
  applyRef.current = onApply;
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    (instruction: string) => {
      if (!docId) return;
      const store = useStylesheetConversation.getState();
      // One request at a time: a second send while one runs would be a burst
      // refusal from the server, which is a worse way to learn it.
      if (turnsFor(docId).some((turn) => turn.status === 'working')) return;
      const against = cssRef.current;
      const history = recentExchanges(turnsFor(docId));
      const id = store.start(docId, instruction, against);
      const controller = new AbortController();
      abortRef.current = controller;
      void (async () => {
        try {
          const result = await requestStylesheet(
            { instruction, css: against, history },
            controller.signal,
          );
          if (controller.signal.aborted) return;
          abortRef.current = null;
          useStylesheetConversation
            .getState()
            .resolve(docId, id, result.proposal.text);
        } catch (cause) {
          if (controller.signal.aborted) {
            // Cancelled: nothing was produced and nothing was counted, so the
            // log keeps no trace of it.
            useStylesheetConversation.getState().discard(docId, id);
            return;
          }
          abortRef.current = null;
          useStylesheetConversation
            .getState()
            .fail(docId, id, errorToMessage(cause));
        } finally {
          // A refusal consumed no allowance, but the remaining count can still
          // have moved; refresh either way.
          void useAccountStore.getState().refresh();
        }
      })();
    },
    [docId],
  );

  const decide = useCallback(
    (turnId: number, decision: StylesheetDecision) => {
      if (!docId) return;
      const store = useStylesheetConversation.getState();
      const turn = turnsFor(docId).find((t) => t.id === turnId);
      if (!turn || turn.status !== 'proposal') return;
      if (decision === 'accepted') {
        const target = stylesheetTarget(turn.against);
        // The card disables Accept when the box moved under the proposal; this
        // is the last guard, so nothing is ever written into text it no longer
        // matches.
        if (isProposalStale(target, cssRef.current)) return;
        const applied = applyProposal(
          target,
          { kind: 'replace', text: turn.reply },
          new Set([0]),
        );
        if (!applied.ok) return;
        applyRef.current(applied.text);
      }
      store.decide(docId, turnId, decision);
    },
    [docId],
  );

  const retry = useCallback(
    (turnId: number) => {
      if (!docId) return;
      const turn = turnsFor(docId).find((t) => t.id === turnId);
      if (turn) run(turn.instruction);
    },
    [docId, run],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  return {
    turns,
    busy: turns.some((turn) => turn.status === 'working'),
    send: run,
    retry,
    decide,
    cancel,
  };
}
