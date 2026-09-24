// ─────────────────────────────────────────────────────────────────────────────
// The Custom Stylesheet's AI conversation (ai-transforms/06).
//
// One log per Document, session-scoped: a user iterating on a stylesheet needs
// "not like that — try it with a thinner rule" to mean something, but keeping
// a chat log would mean a new store, a new sync surface, and a new thing to
// explain in the privacy story (spec §Where the stylesheet lives). So the log
// lives in memory only, dies with the tab, and the durable artifact stays the
// stylesheet the user accepted.
//
// Both surfaces write here: the Stylesheet tab's AI block and an `/ss` typed
// in the editor append to the same per-Document conversation. The box is
// authoritative — a request carries the box's current text plus the last few
// turns — so a hand edit can never be overwritten by stale context.
//
// Pure helpers live here too (the cap, the replayed slice, the provisional
// preview) so the rules are unit-tested without a DOM.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';

/** How many turns the log keeps. Older ones scroll off; nothing is persisted. */
export const MAX_TURNS = 20;

/** How many earlier turns ride along with a request (spec: "the last three"). */
export const HISTORY_TURNS = 3;

/** Whether an undecided proposal was accepted or rejected. */
export type StylesheetDecision = 'accepted' | 'rejected';

/** One turn of the conversation: an instruction, and what came back. */
export type StylesheetTurn =
  | {
      id: number;
      instruction: string;
      /** The box as it stood when the request was sent. */
      against: string;
      status: 'working';
    }
  | {
      id: number;
      instruction: string;
      against: string;
      status: 'proposal';
      /** The complete stylesheet the reply proposed. */
      reply: string;
      decision: StylesheetDecision | null;
    }
  | {
      id: number;
      instruction: string;
      against: string;
      status: 'failed';
      /** A plain message; it never names the provider. */
      error: string;
    };

/** The instruction and reply pairs a request replays, oldest first. */
export interface StylesheetExchange {
  instruction: string;
  reply: string;
}

/** Keeps the log at its cap, oldest turns first out. */
export function capTurns(turns: StylesheetTurn[]): StylesheetTurn[] {
  return turns.length > MAX_TURNS ? turns.slice(-MAX_TURNS) : turns;
}

/**
 * The earlier turns to send with a request: the settled proposals only (a
 * failure or a running turn has no stylesheet to replay), newest last, at most
 * `limit`.
 */
export function recentExchanges(
  turns: StylesheetTurn[],
  limit: number = HISTORY_TURNS,
): StylesheetExchange[] {
  return turns
    .filter(
      (turn): turn is Extract<StylesheetTurn, { status: 'proposal' }> =>
        turn.status === 'proposal',
    )
    .slice(-limit)
    .map(({ instruction, reply }) => ({ instruction, reply }));
}

/**
 * The proposed stylesheet the Paper Canvas should render provisionally: the
 * reply of the *newest* turn, and only while that turn is an undecided
 * proposal. Null otherwise.
 *
 * The newest turn only, deliberately: an older turn left undecided (the user
 * asked again without deciding, or a Retry superseded it) must never put its
 * look back on the paper after a later proposal was accepted or rejected —
 * that would show the user a stylesheet nobody is currently offering.
 */
export function previewReply(
  turns: StylesheetTurn[] | undefined,
): string | null {
  const newest = turns?.[turns.length - 1];
  return newest && newest.status === 'proposal' && newest.decision === null
    ? newest.reply
    : null;
}

/**
 * The pending proposal for the stylesheet box (spec §The review surface): the
 * newest undecided turn's id, what the box held when it was sent, and the
 * complete proposed replacement — the same shape `previewReply` picks, but
 * carrying what the box view needs to diff the proposal where it was asked
 * for. An accepted/rejected turn is not pending, and an older turn never
 * becomes pending again once a newer one exists.
 */
export function pendingProposal(
  turns: StylesheetTurn[] | undefined,
): { id: number; against: string; reply: string } | null {
  const newest = turns?.[turns.length - 1];
  return newest && newest.status === 'proposal' && newest.decision === null
    ? { id: newest.id, against: newest.against, reply: newest.reply }
    : null;
}

export interface StylesheetConversationStore {
  /** Turns per Document id; a Document's log is created on its first turn. */
  turns: Record<string, StylesheetTurn[]>;
  /**
   * Records a turn — the instruction and the box it is about — and returns its
   * id, so the caller can settle it.
   */
  start(docId: string, instruction: string, against: string): number;
  /** The reply arrived: the turn becomes a proposal. */
  resolve(docId: string, id: number, reply: string): void;
  /** The request failed: the turn keeps the instruction and the message. */
  fail(docId: string, id: number, error: string): void;
  /**
   * Drops a turn that never happened — a request the user cancelled. Nothing
   * was produced and nothing was counted, so the log shows no trace of it.
   */
  discard(docId: string, id: number): void;
  /** Accept or Reject. A decided turn stays in the log. */
  decide(docId: string, id: number, decision: StylesheetDecision): void;
}

function update(
  turns: Record<string, StylesheetTurn[]>,
  docId: string,
  id: number,
  patch: (turn: StylesheetTurn) => StylesheetTurn,
): Record<string, StylesheetTurn[]> {
  const current = turns[docId];
  if (!current) return turns;
  return {
    ...turns,
    [docId]: current.map((turn) => (turn.id === id ? patch(turn) : turn)),
  };
}

export function createStylesheetConversation() {
  let nextId = 0;

  const useStore = create<StylesheetConversationStore>()((set) => ({
    turns: {},

    start: (docId, instruction, against) => {
      const id = ++nextId;
      set((state) => ({
        turns: {
          ...state.turns,
          [docId]: capTurns([
            ...(state.turns[docId] ?? []),
            { id, instruction, against, status: 'working' },
          ]),
        },
      }));
      return id;
    },

    resolve: (docId, id, reply) =>
      set((state) => ({
        turns: update(state.turns, docId, id, (turn) =>
          turn.status === 'working'
            ? { ...turn, status: 'proposal', reply, decision: null }
            : turn,
        ),
      })),

    fail: (docId, id, error) =>
      set((state) => ({
        turns: update(state.turns, docId, id, (turn) =>
          turn.status === 'working'
            ? { ...turn, status: 'failed', error }
            : turn,
        ),
      })),

    discard: (docId, id) =>
      set((state) => ({
        turns: {
          ...state.turns,
          [docId]: (state.turns[docId] ?? []).filter((turn) => turn.id !== id),
        },
      })),

    decide: (docId, id, decision) =>
      set((state) => ({
        turns: update(state.turns, docId, id, (turn) =>
          turn.status === 'proposal' ? { ...turn, decision } : turn,
        ),
      })),
  }));

  function resetForTests(): void {
    nextId = 0;
    useStore.setState({ turns: {} });
  }

  return { useStore, resetForTests };
}

/** The app-wide store singleton. */
export const stylesheetConversation = createStylesheetConversation();
export const useStylesheetConversation = stylesheetConversation.useStore;

/** Test hook for the singleton (component tests). */
export const resetStylesheetConversationForTests =
  stylesheetConversation.resetForTests;

/** One shared empty list, so a selector never returns a fresh array. */
const NO_TURNS: StylesheetTurn[] = [];

/** One Document's turns, read outside React (the imperative paths). */
export function turnsFor(docId: string | null): StylesheetTurn[] {
  return docId
    ? (stylesheetConversation.useStore.getState().turns[docId] ?? NO_TURNS)
    : NO_TURNS;
}

/** The turns of one Document's conversation, oldest first. */
export function useStylesheetTurns(docId: string | null): StylesheetTurn[] {
  return useStylesheetConversation(
    (state) => (docId && state.turns[docId]) || NO_TURNS,
  );
}

/**
 * The provisional stylesheet for the Paper Canvas (spec §The review surface):
 * the proposal under review, drawn on the paper so the user judges the look
 * rather than the CSS. It is a render-only override — never persisted — and
 * deciding the proposal drops it, which is what "reverted on Reject" means.
 */
export function useStylesheetPreview(docId: string | null): string | null {
  return useStylesheetConversation((state) =>
    previewReply(docId ? state.turns[docId] : undefined),
  );
}
