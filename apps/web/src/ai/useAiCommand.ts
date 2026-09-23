// ─────────────────────────────────────────────────────────────────────────────
// The AI Action controller for the editor (ai-transforms/05): owns the popup
// and review state, resolves the AI Scope from the live editor, calls the
// route, and applies an accepted proposal through the editor's one-edit path.
//
// It reads AI state from the account store and holds none of its own
// (spec §Data model). A refused, failed, or truncated Action leaves the
// Document and the allowance alone; only a usable proposal becomes an AI
// Proposal in the review dialog.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef, useState } from 'react';
import { resolveAiScope, type AiScope } from '@perfectmarkd/core';
import type { EditorView } from '@codemirror/view';
import { errorToMessage } from '../api/client';
import { useDocumentStore } from '../documents/store';
import { useAccountStore, useAiState } from '../auth/account-store';
import { editStylesheet } from '../inspector/settings-edit';
import { requestMarkdown, requestStylesheet } from './api';
import {
  applyProposal,
  buildChangeSet,
  isProposalStale,
  type AiChangeSet,
} from './proposal';
import type { AiEditorApi } from '../editor/ai-trigger';
import type { AiHint, AiCommandFired } from '../editor/ai-trigger';
import type { AiAccountState, AiCommand, AiProposal, AiTarget } from './types';
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
  proposal: AiProposal;
  instruction: string;
  removed: string;
  at: number;
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
  gate: AiPromptGate;
  request: AiRequestState;
  review: AiReviewState | null;
  /** The review's diff, ready to render; null when nothing is under review. */
  changeSet: AiChangeSet | null;
  /** Whether the review's target changed underneath it. */
  stale: boolean;
  /** Why the review's Accept is disabled beyond "nothing is checked". */
  acceptDisabledReason: string | null;
  /** Whether a Retry is running, or the allowance is spent so it cannot start. */
  retryBlocked: boolean;
  submit(instruction: string): void;
  cancel(): void;
  accept(checked: ReadonlySet<number>): void;
  reject(): void;
  retry(): void;
  editPrompt(): void;
}

export function useAiCommand(
  getEditor: () => EditorView | null,
): AiCommandController {
  const account = useAiState();
  const [hint, setHint] = useState<AiHint | null>(null);
  const [popup, setPopup] = useState<AiPopupState | null>(null);
  const [promptScope, setPromptScope] = useState<AiScope | null>(null);
  const [request, setRequest] = useState<AiRequestState>({ status: 'idle' });
  const [review, setReview] = useState<AiReviewState | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const editorApiRef = useRef<AiEditorApi | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const nonceRef = useRef(0);
  // Re-render when the Document changes so staleness is recomputed live.
  const markdown = useDocumentStore((state) => state.markdown);
  const settings = useDocumentStore((state) => state.settings);

  const computeScope = useCallback(
    (command: AiCommand): AiScope => {
      if (command === 'stylesheet') {
        return resolveAiScope(
          useDocumentStore.getState().settings.customStylesheet,
          null,
        );
      }
      const view = getEditor();
      const text = view
        ? view.state.doc.toString()
        : useDocumentStore.getState().markdown;
      const selection = view ? view.state.selection.main : null;
      return resolveAiScope(
        text,
        selection ? { from: selection.from, to: selection.to } : null,
      );
    },
    [getEditor],
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
      setPromptScope(computeScope(context.command));
    },
    [commandsEnabled, computeScope],
  );

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
    ) => {
      setRequest({ status: 'working' });
      setApplyError(null);
      const controller = new AbortController();
      abortRef.current = controller;
      const scope = computeScope(command);
      const target: AiTarget = {
        kind: scope.kind,
        text: scope.text,
        from: scope.from,
        to: scope.to,
      };
      try {
        const proposal: AiProposal =
          command === 'stylesheet'
            ? (
                await requestStylesheet(
                  { instruction, css: target.text },
                  controller.signal,
                )
              ).proposal
            : (
                await requestMarkdown(
                  { instruction, target },
                  controller.signal,
                )
              ).proposal;
        if (controller.signal.aborted) return;
        abortRef.current = null;
        nonceRef.current += 1;
        setReview({
          command,
          target,
          proposal,
          instruction,
          removed: anchor.removed,
          at: anchor.at,
          nonce: nonceRef.current,
        });
        setPopup(null);
        setRequest({ status: 'idle' });
        // Refresh the account so the remaining count and the disclosure flag
        // reflect the Action the server just counted.
        void useAccountStore.getState().refresh();
      } catch (cause) {
        if (controller.signal.aborted) return;
        abortRef.current = null;
        // A refusal consumed no allowance, but the remaining count can still
        // have moved (another tab, another Action); refresh either way.
        setRequest({ status: 'error', message: errorToMessage(cause) });
        void useAccountStore.getState().refresh();
      }
    },
    [computeScope],
  );

  const submit = useCallback(
    (instruction: string) => {
      if (!popup) return;
      void beginRequest(popup.command, instruction, {
        removed: popup.removed,
        at: popup.at,
      });
    },
    [beginRequest, popup],
  );

  /** Esc, or Close: abort anything running and restore exactly what was removed. */
  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (popup) {
      editorApiRef.current?.restore(popup.removed, popup.at);
    }
    setPopup(null);
    setPromptScope(null);
    setRequest({ status: 'idle' });
  }, [popup]);

  const accept = useCallback(
    (checked: ReadonlySet<number>) => {
      if (!review) return;
      const applied = applyProposal(review.target, review.proposal, checked);
      if (!applied.ok) {
        setApplyError(applied.reason);
        return;
      }
      if (review.command === 'stylesheet') {
        const current = useDocumentStore.getState().settings;
        useDocumentStore.getState().updateActive({
          settings: editStylesheet(current, applied.text),
        });
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
    },
    [getEditor, review],
  );

  const reject = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setReview(null);
    setApplyError(null);
    setRequest({ status: 'idle' });
    getEditor()?.focus();
  }, [getEditor]);

  /** Retry: a fresh AI Action with the same prompt, in place. */
  const retry = useCallback(() => {
    if (!review) return;
    void beginRequest(review.command, review.instruction, {
      removed: review.removed,
      at: review.at,
    });
  }, [beginRequest, review]);

  /** Edit prompt: back to the popup with the prompt intact. */
  const editPrompt = useCallback(() => {
    if (!review) return;
    setReview(null);
    setApplyError(null);
    setPopup({
      command: review.command,
      removed: review.removed,
      at: review.at,
      instruction: review.instruction,
    });
    setPromptScope(computeScope(review.command));
    setRequest({ status: 'idle' });
  }, [computeScope, review]);

  // Staleness for the review dialog: the target text as it stands now.
  const currentTargetText = review
    ? review.command === 'stylesheet'
      ? settings.customStylesheet
      : markdown.slice(review.target.from, review.target.to)
    : '';
  const stale = review
    ? isProposalStale(review.target, currentTargetText)
    : false;

  const changeSet = review
    ? buildChangeSet(review.target, review.proposal)
    : null;

  const acceptDisabledReason = review
    ? (applyError ??
      (stale
        ? 'The text this proposal targets has changed — Retry for a fresh proposal.'
        : null) ??
      (account && account.remaining <= 0
        ? 'No AI Actions left this period.'
        : null) ??
      (request.status === 'error' ? request.message : null))
    : null;

  const busy = request.status === 'working';
  // Retry is the remedy for a stale proposal, so it stays available there; an
  // exhausted allowance blocks it, because a resubmission is a fresh Action.
  const retryBlocked = busy || (!!account && account.remaining <= 0);

  return {
    editorApiRef,
    aiHandlers: {
      enabled: () => commandsEnabledRef.current,
      onHintChange,
      onCommandFired,
    },
    account,
    commandsEnabled,
    hint,
    popup,
    promptScope,
    gate,
    request,
    review,
    changeSet,
    stale,
    acceptDisabledReason,
    retryBlocked,
    submit,
    cancel,
    accept,
    reject,
    retry,
    editPrompt,
  };
}
