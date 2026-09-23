// ─────────────────────────────────────────────────────────────────────────────
// The editor half of the `/ai` and `/ss` triggers (spec §The two commands and
// their trigger rules): a CodeMirror extension that watches typed input only —
// a paste or a programmatic edit never fires — shows the hint while a command
// is being typed, consumes the trigger when it is confirmed, and gives the
// pane an API to accept the hint, restore a cancelled trigger, and write an
// accepted proposal back as one dispatched edit.
// ─────────────────────────────────────────────────────────────────────────────

import { EditorView, ViewPlugin, keymap } from '@codemirror/view';
import { type Extension } from '@codemirror/state';
import { findAiTrigger, triggerRemovalRange } from '../ai/trigger';
import type { AiCommand } from '../ai/types';

/** The hint state the pane renders; null when no partial command is present. */
export interface AiHint {
  command: AiCommand;
  from: number;
  commandEnd: number;
}

/** A confirmed command, with exactly what was removed so Esc can restore it. */
export interface AiCommandFired {
  command: AiCommand;
  removed: string;
  at: number;
}

export interface AiTriggerHandlers {
  /**
   * Whether the commands exist at all right now — the instance is configured
   * and the caller has not turned AI Access off. Read per keystroke, because
   * the account state can change under the editor; when it is false the
   * extension must consume nothing, so `/ai` stays ordinary prose.
   */
  enabled(): boolean;
  onHintChange(hint: AiHint | null): void;
  onCommandFired(context: AiCommandFired): void;
  /**
   * The caret or selection moved. The popup's target is the selection when
   * there is one, so a selection made while the popup is open has to reach it:
   * the readout and the size decision follow the editor, and the request sends
   * what the readout says (ai-transforms/07).
   */
  onSelectionChange(): void;
}

/** The pane-facing API the extension exposes for the React side. */
export interface AiEditorApi {
  /** Fires the command whose hint is showing (a click on the hint). */
  acceptHint(): void;
  /** Esc: inserts exactly what was removed, leaving the Document as it was. */
  restore(removed: string, at: number): void;
  /** Writes an accepted proposal back as one edit and focuses the caret. */
  replaceRange(from: number, to: number, text: string): void;
}

export function createAiTriggerExtension(
  handlers: AiTriggerHandlers,
  apiRef: { current: AiEditorApi | null },
): Extension {
  let view: EditorView | null = null;

  const trackView = ViewPlugin.fromClass(
    class {
      constructor(editor: EditorView) {
        view = editor;
      }
      destroy() {
        view = null;
      }
    },
  );

  /** Removes the trigger and reports it, including the typed space if present. */
  const fire = (editor: EditorView): void => {
    const trigger = findAiTrigger(
      editor.state.doc.toString(),
      editor.state.selection.main.head,
    );
    if (!trigger) return;
    const range = triggerRemovalRange(trigger, trigger.complete);
    const removed = editor.state.sliceDoc(range.from, range.to);
    editor.dispatch({
      changes: { from: range.from, to: range.to, insert: '' },
      selection: { anchor: range.from },
    });
    handlers.onHintChange(null);
    handlers.onCommandFired({
      command: trigger.command,
      removed,
      at: range.from,
    });
  };

  const fireFromHint = (editor: EditorView): boolean => {
    const trigger = findAiTrigger(
      editor.state.doc.toString(),
      editor.state.selection.main.head,
    );
    if (!trigger) return false;
    fire(editor);
    return true;
  };

  // The command fires the moment its completing space arrives: intercept the
  // space instead of inserting it, so the trigger text never pollutes the
  // Document. Only a complete `/ai` or `/ss` qualifies (`/a ` never fires).
  // With the commands unavailable every binding declines, so the space and the
  // Tab/Enter keys behave as they always do and the trigger stays as prose.
  const keymapExtension = keymap.of([
    {
      key: 'Space',
      run: (editor) => {
        if (!handlers.enabled()) return false;
        const trigger = findAiTrigger(
          editor.state.doc.toString(),
          editor.state.selection.main.head,
        );
        if (!trigger || trigger.commandEnd - trigger.from !== 3) return false;
        fire(editor);
        return true;
      },
    },
    // Hint acceptance: Tab or Enter fires the partial/complete command.
    { key: 'Tab', run: (editor) => handlers.enabled() && fireFromHint(editor) },
    {
      key: 'Enter',
      run: (editor) => handlers.enabled() && fireFromHint(editor),
    },
  ]);

  apiRef.current = {
    acceptHint: () => {
      if (view) fireFromHint(view);
    },
    restore: (removed, at) => {
      if (!view) return;
      const position = Math.min(Math.max(0, at), view.state.doc.length);
      view.dispatch({
        changes: { from: position, insert: removed },
        selection: { anchor: position + removed.length },
      });
      view.focus();
    },
    replaceRange: (from, to, text) => {
      if (!view) return;
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
      });
      view.focus();
    },
  };

  const hintListener = EditorView.updateListener.of((update) => {
    if (update.selectionSet && handlers.enabled()) {
      handlers.onSelectionChange();
    }
    if (!update.docChanged) return;
    // Typed input only: a paste or a programmatic edit triggers nothing.
    const typed = update.transactions.some((tr) =>
      tr.isUserEvent('input.type'),
    );
    if (!typed) {
      handlers.onHintChange(null);
      return;
    }
    const trigger = findAiTrigger(
      update.state.doc.toString(),
      update.state.selection.main.head,
    );
    handlers.onHintChange(
      trigger
        ? {
            command: trigger.command,
            from: trigger.from,
            commandEnd: trigger.commandEnd,
          }
        : null,
    );
  });

  return [trackView, keymapExtension, hintListener];
}
