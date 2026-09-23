// ─────────────────────────────────────────────────────────────────────────────
// The AI Action controller for the editor (ai-transforms/05, extended by 07):
// owns the popup, the plan, and the review state, resolves the AI Scope from
// the live editor, calls the route, and applies an accepted proposal through
// the editor's one-edit path.
//
// It reads AI state from the account store and holds none of its own
// (spec §Data model). A refused, failed, or truncated Action leaves the
// Document and the allowance alone; only a usable proposal becomes an AI
// Proposal in the review dialog.
//
// The size ladder runs here, from the shared module, and decides what the
// popup offers: everything, the target plus an outline of the rest, an AI
// Plan, or a refusal with the paragraph around the caret offered instead
// (ai-transforms/07, spec §Scope, the size ladder).
//
// `/ss` is the same interaction aimed at the Custom Stylesheet, so its turns
// join the per-Document conversation the Stylesheet tab shows
// (ai-transforms/06): the same log, the same proposal, the same provisional
// paper — without moving the Inspector to another tab.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef, useState } from 'react';
import {
  aiBudgets,
  buildOutlineDigest,
  checkAiSendSize,
  decideAiLadder,
  extractSections,
  findPlanStepSection,
  planBriefText,
  resolveAiScope,
  resolveParagraphRange,
  sectionLabels,
  type AiLadderDecision,
  type AiScope,
} from '@perfectmarkd/core';
import type { EditorView } from '@codemirror/view';
import { errorToMessage } from '../api/client';
import { useDocumentStore } from '../documents/store';
import { useAccountStore, useAiState } from '../auth/account-store';
import { applyStylesheetProposal } from '../inspector/settings-edit';
import { requestMarkdown, requestPlan, requestStylesheet } from './api';
import {
  recentExchanges,
  turnsFor,
  useStylesheetConversation,
  type StylesheetDecision,
} from './conversation';
import {
  applyProposal,
  buildChangeSet,
  isProposalStale,
  type AiChangeSet,
} from './proposal';
import { planBrief, planSummary, type AiPlanState } from './plan';
import type { AiEditorApi } from '../editor/ai-trigger';
import type { AiHint, AiCommandFired } from '../editor/ai-trigger';
import type {
  AiAccountState,
  AiCommand,
  AiEditProposal,
  AiTarget,
} from './types';
import type { AiPromptGate, AiRequestState } from './AiPromptPopover';

/** The prompt popup's state: the command, and what Esc must put back. */
export interface AiPopupState {
  command: AiCommand;
  /** Exactly what was removed, so Esc can restore it. */
  removed: string;
  /** Document offset where the trigger was. */
  at: number;
  /** Prefilled when the user came back via "Edit prompt". */
  instruction: string;
}

export interface AiReviewState {
  command: AiCommand;
  target: AiTarget;
  proposal: AiEditProposal;
  instruction: string;
  removed: string;
  at: number;
  /**
   * The Document the proposal belongs to, and its turn in that Document's
   * stylesheet conversation — null for `/ai`, which has no conversation.
   */
  docId: string | null;
  turnId: number | null;
  /** Set when this proposal is one step of an approved AI Plan. */
  plan: { at: number; total: number } | null;
  /**
   * Bumped per proposal so the dialog's own state (which changes are checked,
   * whether the long diff is expanded) resets when a Retry returns a new one.
   */
  nonce: number;
}

export interface AiCommandController {
  /** The extension's API, for the pane to render the hint and focus. */
  editorApiRef: { current: AiEditorApi | null };
  aiHandlers: {
    /** Whether the commands exist right now; the extension reads it per key. */
    enabled(): boolean;
    onHintChange(hint: AiHint | null): void;
    onCommandFired(context: AiCommandFired): void;
    onSelectionChange(): void;
  };
  /** The instance's and the caller's AI state, or null signed out. */
  account: AiAccountState | null;
  /**
   * Whether the commands exist at all: the instance is configured and the
   * caller has not turned AI Access off (spec §Gate precedence, steps 1 and 3).
   */
  commandsEnabled: boolean;
  hint: AiHint | null;
  popup: AiPopupState | null;
  promptScope: AiScope | null;
  /** The size ladder's decision for the open popup; null for `/ss`. */
  ladder: AiLadderDecision | null;
  gate: AiPromptGate;
  request: AiRequestState;
  review: AiReviewState | null;
  /** The AI Plan awaiting approval, running, or just finished. */
  plan: AiPlanState | null;
  /** The review's diff, ready to render; null when nothing is under review. */
  changeSet: AiChangeSet | null;
  /** Whether the review's target changed underneath it. */
  stale: boolean;
  /** Why the review's Accept is disabled beyond "nothing is checked". */
  acceptDisabledReason: string | null;
  /** Whether a Retry is running, or the allowance is spent so it cannot start. */
  retryBlocked: boolean;
  submit(instruction: string): void;
  /** Asks for an AI Plan instead of running a whole-Document action. */
  submitPlan(instruction: string): void;
  /** Works on the paragraph around the caret instead of the refused target. */
  useParagraphRange(): void;
  cancel(): void;
  accept(checked: ReadonlySet<number>): void;
  reject(): void;
  retry(): void;
  editPrompt(): void;
  approvePlan(checked: ReadonlySet<number>): void;
  discardPlan(): void;
  stopPlan(): void;
  closePlan(): void;
}

export function useAiCommand(
  getEditor: () => EditorView | null,
): AiCommandController {
  const account = useAiState();
  const [hint, setHint] = useState<AiHint | null>(null);
  const [popup, setPopup] = useState<AiPopupState | null>(null);
  const [promptScope, setPromptScope] = useState<AiScope | null>(null);
  const [ladder, setLadder] = useState<AiLadderDecision | null>(null);
  const [request, setRequest] = useState<AiRequestState>({ status: 'idle' });
  const [review, setReview] = useState<AiReviewState | null>(null);
  const [plan, setPlan] = useState<AiPlanState | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const editorApiRef = useRef<AiEditorApi | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const nonceRef = useRef(0);
  // The run's own state, readable from an async continuation without the
  // closure that started it having gone stale.
  const planRef = useRef<AiPlanState | null>(null);
  planRef.current = plan;
  // Re-render when the Document changes so staleness is recomputed live.
  const markdown = useDocumentStore((state) => state.markdown);
  const settings = useDocumentStore((state) => state.settings);
  const activeId = useDocumentStore((state) => state.activeId);
  /**
   * A proposal belongs to the Document it was computed against, and the review
   * survives a Document switch (the editor pane does not unmount). Accepting a
   * foreign proposal would write into the wrong Document, so it is refused
   * with the reason stated rather than applied.
   */
  const foreignReview =
    review !== null && review.docId !== null && review.docId !== activeId;

  const documentText = useCallback((): string => {
    const view = getEditor();
    return view ? view.state.doc.toString() : useDocumentStore.getState().markdown;
  }, [getEditor]);

  const computeScope = useCallback(
    (command: AiCommand): AiScope => {
      if (command === 'stylesheet') {
        return resolveAiScope(
          useDocumentStore.getState().settings.customStylesheet,
          null,
        );
      }
      const view = getEditor();
      const text = documentText();
      const selection = view ? view.state.selection.main : null;
      return resolveAiScope(
        text,
        selection ? { from: selection.from, to: selection.to } : null,
      );
    },
    [documentText, getEditor],
  );

  /** The size ladder over the Document, the target, and the account's budgets. */
  const decideFor = useCallback(
    (command: AiCommand, scope: AiScope): AiLadderDecision | null => {
      if (command !== 'markdown' || !account) return null;
      const view = getEditor();
      return decideAiLadder({
        documentText: documentText(),
        target: scope,
        budgets: aiBudgets(account),
        cursor: view ? view.state.selection.main.head : null,
      });
    },
    [account, documentText, getEditor],
  );

  // Step 1 (not configured) and step 3 (AI Access off) both mean the commands
  // do not exist — no hint, no popup, nothing in the editor.
  const commandsEnabled = !!account?.configured && account.access;
  // The editor extension holds this across renders, so it reads the current
  // value rather than the one captured when the editor was built.
  const commandsEnabledRef = useRef(false);
  commandsEnabledRef.current = commandsEnabled;
  const gate: AiPromptGate = !account?.included
    ? 'not_entitled'
    : account.remaining <= 0
      ? 'exhausted'
      : 'ready';

  const onHintChange = useCallback(
    (next: AiHint | null) => {
      setHint(commandsEnabled ? next : null);
    },
    [commandsEnabled],
  );

  const onCommandFired = useCallback(
    (context: AiCommandFired) => {
      if (!commandsEnabled) return;
      setHint(null);
      setRequest({ status: 'idle' });
      setReview(null);
      setApplyError(null);
      setPopup({
        command: context.command,
        removed: context.removed,
        at: context.at,
        instruction: '',
      });
      const scope = computeScope(context.command);
      setPromptScope(scope);
      setLadder(decideFor(context.command, scope));
    },
    [commandsEnabled, computeScope, decideFor],
  );

  /**
   * The target follows the editor: a selection made while the popup is open
   * becomes the target, and the ladder is re-decided for it, so what the
   * readout says is what the request sends.
   */
  const onSelectionChange = useCallback(() => {
    if (!popup || request.status === 'working') return;
    const scope = computeScope(popup.command);
    setPromptScope(scope);
    setLadder(decideFor(popup.command, scope));
  }, [computeScope, decideFor, popup, request.status]);

  /**
   * Runs one AI Action. The anchor (what the trigger removed and where) is
   * passed in rather than read from `popup`: Retry starts a request without
   * the popup being open, and reading state that was just set in the same tick
   * would silently drop the review.
   */
  const beginRequest = useCallback(
    async (
      command: AiCommand,
      instruction: string,
      anchor: { removed: string; at: number },
      /** The scope the popup is showing. It is passed in rather than resolved
       *  again, so the request sends exactly what the readout said — a scope
       *  narrowed to a paragraph, or to a selection, would otherwise be
       *  re-resolved to the whole Document on submit. */
      shown?: AiScope,
    ) => {
      setRequest({ status: 'working' });
      setApplyError(null);
      const controller = new AbortController();
      abortRef.current = controller;
      const scope = shown ?? computeScope(command);
      // The ladder decides what is sent. A refused target never reaches the
      // route — the popup says why and offers the paragraph instead.
      const decision = decideFor(command, scope);
      if (decision !== null && decision.tier === 3) {
        abortRef.current = null;
        setRequest({ status: 'error', message: decision.refusal.message });
        return;
      }
      const context =
        decision === null
          ? null
          : decision.tier === 0
            ? decision.context
            : decision.tier === 1
              ? decision.digest
              : null;
      const target: AiTarget = {
        kind: scope.kind,
        text: scope.text,
        from: scope.from,
        to: scope.to,
      };
      // A stylesheet Action is a turn in the Document's conversation: it is
      // logged before it runs (so the log shows what is being asked), replayed
      // with the last few turns, and decided by the review dialog.
      const docId =
        command === 'stylesheet' ? useDocumentStore.getState().activeId : null;
      let turnId: number | null = null;
      let history: ReturnType<typeof recentExchanges> = [];
      if (docId) {
        const conversation = useStylesheetConversation.getState();
        history = recentExchanges(turnsFor(docId));
        turnId = conversation.start(docId, instruction, target.text);
      }
      const dropTurn = () => {
        if (docId && turnId !== null) {
          useStylesheetConversation.getState().discard(docId, turnId);
        }
      };
      try {
        let proposal: AiEditProposal;
        if (command === 'stylesheet') {
          const result = await requestStylesheet(
            { instruction, css: target.text, history },
            controller.signal,
          );
          if (controller.signal.aborted) {
            // Cancelled: the request produced nothing and cost nothing, so the
            // log keeps no trace of it.
            dropTurn();
            return;
          }
          proposal = result.proposal;
          if (docId && turnId !== null) {
            useStylesheetConversation
              .getState()
              .resolve(docId, turnId, result.proposal.text);
          }
        } else {
          proposal = (
            await requestMarkdown(
              { instruction, target, context },
              controller.signal,
            )
          ).proposal;
          if (controller.signal.aborted) return;
        }
        abortRef.current = null;
        nonceRef.current += 1;
        setReview({
          command,
          target,
          proposal,
          instruction,
          removed: anchor.removed,
          at: anchor.at,
          docId,
          turnId,
          plan: null,
          nonce: nonceRef.current,
        });
        setPopup(null);
        setRequest({ status: 'idle' });
        // Refresh the account so the remaining count and the disclosure flag
        // reflect the Action the server just counted.
        void useAccountStore.getState().refresh();
      } catch (cause) {
        if (controller.signal.aborted) {
          dropTurn();
          return;
        }
        abortRef.current = null;
        const message = errorToMessage(cause);
        if (docId && turnId !== null) {
          useStylesheetConversation.getState().fail(docId, turnId, message);
        }
        // A refusal consumed no allowance, but the remaining count can still
        // have moved (another tab, another Action); refresh either way.
        setRequest({ status: 'error', message });
        void useAccountStore.getState().refresh();
      }
    },
    [computeScope, decideFor],
  );

  const submit = useCallback(
    (instruction: string) => {
      if (!popup || !promptScope) return;
      void beginRequest(
        popup.command,
        instruction,
        { removed: popup.removed, at: popup.at },
        promptScope,
      );
    },
    [beginRequest, popup, promptScope],
  );

  // ─── The AI Plan ──────────────────────────────────────────────────────────

  /**
   * Runs one plan step: resolves its section against the Document as it stands
   * now, then asks for that step's own proposal. Everything that can stop the
   * run stops it here, before an AI Action is spent, and says what remains.
   */
  const runPlanStep = useCallback(
    async (state: AiPlanState, at: number) => {
      const step = state.steps[at]!;
      const stop = (note: string) => {
        setRequest({ status: 'idle' });
        setPlan({ ...state, phase: 'stopped', at, note });
      };
      if (useDocumentStore.getState().activeId !== state.docId) {
        return stop(
          planSummary(state, 'That plan belongs to another document.'),
        );
      }
      const section = findPlanStepSection(
        extractSections(documentText()),
        step,
      );
      if (section === null) {
        return stop(
          planSummary(
            state,
            'That section is no longer in the document, so the plan stopped.',
          ),
        );
      }
      const current = useAccountStore.getState().ai;
      if (current !== null && current.remaining <= 0) {
        return stop(
          planSummary(state, 'You have used all your AI Actions this period.'),
        );
      }


      // A section too large for one Action is refused before anything is spent
      // (spec §Tier 3): the plan stops and says what remains. A step sends its
      // own section, its brief, and nothing else — no digest, no rest of the
      // Document — so it is measured on its own, not through the ladder's
      // wider tiers, and by the same shared check the server will run.
      const brief = planBriefText(planBrief(state.steps, at));
      const check = current
        ? checkAiSendSize({
            instruction: state.instruction,
            targetText: section.text,
            brief,
            budgets: aiBudgets(current),
          })
        : { ok: true as const };
      if (!check.ok) {
        return stop(planSummary(state, check.refusal.message));
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setRequest({ status: 'working' });
      try {
        const result = await requestMarkdown(
          {
            instruction: state.instruction,
            target: {
              kind: 'selection',
              text: section.text,
              from: section.from,
              to: section.to,
            },
            plan: planBrief(state.steps, at),
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        abortRef.current = null;
        nonceRef.current += 1;
        setPlan({ ...state, phase: 'running', at });
        setReview({
          command: 'markdown',
          target: {
            kind: 'selection',
            text: section.text,
            from: section.from,
            to: section.to,
          },
          proposal: result.proposal,
          instruction: state.instruction,
          removed: '',
          at: section.from,
          docId: state.docId,
          turnId: null,
          plan: { at, total: state.steps.length },
          nonce: nonceRef.current,
        });
        setRequest({ status: 'idle' });
        void useAccountStore.getState().refresh();
      } catch (cause) {
        if (controller.signal.aborted) return;
        abortRef.current = null;
        stop(planSummary(state, errorToMessage(cause)));
        void useAccountStore.getState().refresh();
      }
    },
    [documentText],
  );

  /** Decides one step and moves the run on: accept keeps it, reject skips it. */
  const advancePlan = useCallback(
    (state: AiPlanState, at: number, accepted: boolean) => {
      const next: AiPlanState = {
        ...state,
        at: at + 1,
        accepted: state.accepted + (accepted ? 1 : 0),
        rejected: state.rejected + (accepted ? 0 : 1),
      };
      if (next.at >= next.steps.length) {
        setPlan({
          ...next,
          phase: 'finished',
          note: planSummary(next, 'Plan finished.'),
        });
        return;
      }
      void runPlanStep(next, next.at);
    },
    [runPlanStep],
  );

  const submitPlan = useCallback(
    (instruction: string) => {
      if (!popup) return;
      // A plan belongs to the Document it was planned from, and there is
      // always one while the editor is open.
      const docId = useDocumentStore.getState().activeId;
      if (docId === null) return;
      const text = documentText();
      const sections = extractSections(text);
      setRequest({ status: 'working' });
      setApplyError(null);
      const controller = new AbortController();
      abortRef.current = controller;
      void (async () => {
        try {
          const result = await requestPlan(
            {
              instruction,
              outline: buildOutlineDigest(sections),
              sections: sectionLabels(sections),
            },
            controller.signal,
          );
          if (controller.signal.aborted) return;
          abortRef.current = null;
          nonceRef.current += 1;
          setPopup(null);
          setPromptScope(null);
          setLadder(null);
          setPlan({
            docId,
            instruction,
            steps: result.proposal.steps,
            phase: 'approving',
            at: 0,
            accepted: 0,
            rejected: 0,
            note: null,
            nonce: nonceRef.current,
          });
          setRequest({ status: 'idle' });
          void useAccountStore.getState().refresh();
        } catch (cause) {
          if (controller.signal.aborted) return;
          abortRef.current = null;
          setRequest({ status: 'error', message: errorToMessage(cause) });
          void useAccountStore.getState().refresh();
        }
      })();
    },
    [documentText, popup],
  );

  /** Approves the checked steps and starts the run. A plan never auto-runs. */
  const approvePlan = useCallback(
    (checked: ReadonlySet<number>) => {
      const state = planRef.current;
      if (!state || state.phase !== 'approving') return;
      const steps = state.steps.filter((_, index) => checked.has(index));
      if (steps.length === 0) return;
      const next: AiPlanState = {
        ...state,
        steps,
        phase: 'running',
        at: 0,
        accepted: 0,
        rejected: 0,
        note: null,
      };
      setPlan(next);
      void runPlanStep(next, 0);
    },
    [runPlanStep],
  );

  const discardPlan = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPlan(null);
    setRequest({ status: 'idle' });
  }, []);

  /** Stops the run: what was accepted stays applied, and the summary says
   *  what remains (spec §Tier 2). */
  const stopPlan = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const state = planRef.current;
    setReview(null);
    setApplyError(null);
    setRequest({ status: 'idle' });
    if (!state) return;
    setPlan({ ...state, phase: 'stopped', note: planSummary(state, 'Stopped.') });
  }, []);

  const closePlan = useCallback(() => {
    setPlan(null);
    getEditor()?.focus();
  }, [getEditor]);

  // ─── The rest of the interaction ──────────────────────────────────────────

  /** Esc, or Close: abort anything running and restore exactly what was removed. */
  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (popup) {
      editorApiRef.current?.restore(popup.removed, popup.at);
    }
    setPopup(null);
    setPromptScope(null);
    setLadder(null);
    setRequest({ status: 'idle' });
  }, [popup]);

  /** Works on the paragraph around the caret instead of the refused target. */
  const useParagraphRange = useCallback(() => {
    if (!popup) return;
    const view = getEditor();
    const text = documentText();
    const range = resolveParagraphRange(
      text,
      view ? view.state.selection.main.head : null,
    );
    if (range === null) return;
    const scope = resolveAiScope(text, range);
    setPromptScope(scope);
    setLadder(decideFor(popup.command, scope));
    setRequest({ status: 'idle' });
  }, [decideFor, documentText, getEditor, popup]);

  const accept = useCallback(
    (checked: ReadonlySet<number>) => {
      if (!review || foreignReview) return;
      const applied = applyProposal(review.target, review.proposal, checked);
      if (!applied.ok) {
        setApplyError(applied.reason);
        return;
      }
      const stepPlan = review.plan;
      const state = planRef.current;
      if (review.command === 'stylesheet') {
        useDocumentStore.getState().updateActive({
          settings: applyStylesheetProposal(applied.text),
        });
        // The turn is decided in the Document's conversation, so the log and
        // the provisional paper agree with what just happened.
        decideTurn(review, 'accepted');
        // The user asked from the editor; put the caret back where it was.
        getEditor()?.focus();
      } else {
        // A final staleness guard: never write into text it no longer matches.
        const view = getEditor();
        const current = view
          ? view.state.doc
              .toString()
              .slice(review.target.from, review.target.to)
          : '';
        if (current !== review.target.text) {
          setApplyError(
            'The text this proposal targets has changed — Retry for a fresh proposal.',
          );
          return;
        }
        // One dispatch: autosave, cross-tab broadcast, and undo all behave as
        // they do for a hand edit, and the whole acceptance is one undo step.
        editorApiRef.current?.replaceRange(
          review.target.from,
          review.target.to,
          applied.text,
        );
      }
      setReview(null);
      setApplyError(null);
      if (state && stepPlan) advancePlan(state, stepPlan.at, true);
    },
    [advancePlan, foreignReview, getEditor, review],
  );

  const reject = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (review) decideTurn(review, 'rejected');
    const stepPlan = review?.plan ?? null;
    const state = planRef.current;
    setReview(null);
    setApplyError(null);
    setRequest({ status: 'idle' });
    getEditor()?.focus();
    // Rejecting a step skips it and the run moves on: the steps are decided
    // one at a time, and stopping the run is its own action.
    if (state && stepPlan) advancePlan(state, stepPlan.at, false);
  }, [advancePlan, getEditor, review]);

  /** Retry: a fresh AI Action for the same prompt, in place. A plan step is
   *  re-resolved against the Document, so a section that moved is followed. */
  const retry = useCallback(() => {
    if (!review) return;
    const stepPlan = review.plan;
    const state = planRef.current;
    if (state && stepPlan) {
      setReview(null);
      void runPlanStep(state, stepPlan.at);
      return;
    }
    void beginRequest(review.command, review.instruction, {
      removed: review.removed,
      at: review.at,
    });
  }, [beginRequest, review, runPlanStep]);

  /** Edit prompt: back to the popup with the prompt intact. */
  const editPrompt = useCallback(() => {
    if (!review) return;
    // Rewriting the prompt is "not this one": the turn is decided in the log,
    // so it stops holding the provisional paper while the new prompt is typed.
    decideTurn(review, 'rejected');
    setReview(null);
    setApplyError(null);
    setPopup({
      command: review.command,
      removed: review.removed,
      at: review.at,
      instruction: review.instruction,
    });
    const scope = computeScope(review.command);
    setPromptScope(scope);
    setLadder(decideFor(review.command, scope));
    setRequest({ status: 'idle' });
  }, [computeScope, decideFor, review]);

  // Staleness for the review dialog: the text as it stands now. The checker
  // slices the target's own range out of what it is given, so it gets the
  // whole Document — passing a pre-sliced range made every target that does
  // not start at offset 0 read as changed. A foreign review is not checked
  // against the open Document; its reason is the Document mismatch itself.
  const currentTargetText = review
    ? review.command === 'stylesheet'
      ? settings.customStylesheet
      : markdown
    : '';
  const stale =
    review && !foreignReview
      ? isProposalStale(review.target, currentTargetText)
      : false;

  const changeSet = review
    ? buildChangeSet(review.target, review.proposal)
    : null;

  const acceptDisabledReason = review
    ? (applyError ??
      (foreignReview
        ? 'This proposal belongs to another document. Open that document to decide it.'
        : null) ??
      (stale
        ? review.command === 'stylesheet'
          ? 'The stylesheet changed since this was proposed — Retry for a fresh proposal.'
          : 'The text this proposal targets has changed — Retry for a fresh proposal.'
        : null) ??
      (account && account.remaining <= 0
        ? 'No AI Actions left this period.'
        : null) ??
      (request.status === 'error' ? request.message : null))
    : null;

  const busy = request.status === 'working';
  // Retry is the remedy for a stale proposal, so it stays available there; an
  // exhausted allowance blocks it, because a resubmission is a fresh Action,
  // and so does a proposal that belongs to a Document the user has left.
  const retryBlocked =
    busy || foreignReview || (!!account && account.remaining <= 0);

  return {
    editorApiRef,
    aiHandlers: {
      enabled: () => commandsEnabledRef.current,
      onHintChange,
      onCommandFired,
      onSelectionChange,
    },
    account,
    commandsEnabled,
    hint,
    popup,
    promptScope,
    ladder,
    gate,
    request,
    review,
    plan,
    changeSet,
    stale,
    acceptDisabledReason,
    retryBlocked,
    submit,
    submitPlan,
    useParagraphRange,
    cancel,
    accept,
    reject,
    retry,
    editPrompt,
    approvePlan,
    discardPlan,
    stopPlan,
    closePlan,
  };
}

/**
 * Decides a stylesheet review's turn in its Document's conversation. `/ai` has
 * no conversation, so it is a no-op there.
 */
function decideTurn(review: AiReviewState, decision: StylesheetDecision): void {
  if (
    review.command !== 'stylesheet' ||
    review.docId === null ||
    review.turnId === null
  ) {
    return;
  }
  useStylesheetConversation
    .getState()
    .decide(review.docId, review.turnId, decision);
}
