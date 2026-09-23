// CodeMirror extension bundle for the editor pane: markdown language +
// highlighting, line wrapping, Page Break flagging, keymaps, and the hook the
// pane uses to push document changes into the store.

import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { RangeSetBuilder, Annotation, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  drawSelection,
  keymap,
  placeholder,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { isImageFile } from '../assets/ingest';
import { insertLink, toggleBold, toggleItalic } from './markdown-commands';
import {
  createAiTriggerExtension,
  type AiCommandFired,
  type AiEditorApi,
  type AiHint,
} from './ai-trigger';

/** Matches the engine's section splitter: a `///` marker alone on its line. */
export function isPageBreakLine(text: string): boolean {
  return /^\/\/\/\s*$/.test(text);
}

/** Proportional scroll position in 0..1 — the canvas side of the scroll sync
 *  maps this fraction onto its pages. */
export function editorScrollFraction(el: HTMLElement): number {
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, el.scrollTop / max));
}

const pageBreakMark = Decoration.line({ class: 'cm-page-break' });

/** Flags `///` Page Break lines with a whole-line decoration. */
const pageBreakFlags = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildPageBreakFlags(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildPageBreakFlags(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

function buildPageBreakFlags(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = view.state.doc.lineAt(pos);
      if (isPageBreakLine(line.text)) {
        builder.add(line.from, line.from, pageBreakMark);
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

/** Class-based highlight style; the classes are styled in editor.css so the
 *  colors follow the design tokens (and dark mode) without a second style. */
const markdownHighlighting = HighlightStyle.define([
  { tag: t.heading, class: 'cm-md-heading' },
  { tag: t.strong, class: 'cm-md-strong' },
  { tag: t.emphasis, class: 'cm-md-em' },
  { tag: t.strikethrough, class: 'cm-md-strike' },
  { tag: t.link, class: 'cm-md-link' },
  { tag: t.url, class: 'cm-md-url' },
  { tag: t.monospace, class: 'cm-md-code' },
  { tag: t.quote, class: 'cm-md-quote' },
  { tag: t.processingInstruction, class: 'cm-md-meta' },
  { tag: t.contentSeparator, class: 'cm-md-sep' },
]);

export interface EditorHandlers {
  /** Document text changed in the editor (every keystroke). */
  onDocChanged(text: string): void;
  /** Ctrl/Cmd+Enter — the manual render request for the Paper Canvas. */
  onRequestRender(): void;
  /** Image files pasted or dropped onto the editor; `pos` is the drop point
   *  (undefined for paste — the cursor). Image detection is a cheap pre-filter
   *  here; ingest validation has the final word. */
  onImageFiles(files: File[], pos?: number): void;
  /** The `/ai` and `/ss` triggers (ai-transforms/05), when the pane wires them. */
  ai?: {
    enabled(): boolean;
    onHintChange(hint: AiHint | null): void;
    onCommandFired(context: AiCommandFired): void;
    onSelectionChange(): void;
    apiRef: { current: AiEditorApi | null };
  };
}

/** Tags the pane's own dispatches that adopt markdown changed elsewhere (doc
 *  switch, import, remote adoption): the store already holds that text, so
 *  the update listener must not push it back as an edit. */
export const externalSync = Annotation.define();

/** Clipboard/dragged image files, ignoring everything else so text pastes and
 *  .md drops flow through their normal paths untouched. */
function imageFiles(source: FileList | null | undefined): File[] {
  return Array.from(source ?? []).filter(isImageFile);
}

export function createEditorExtensions(handlers: EditorHandlers): Extension[] {
  return [
    // The /ai and /ss triggers first: their Space/Tab/Enter bindings must win
    // before the default keymaps (ai-transforms/05).
    ...(handlers.ai
      ? [createAiTriggerExtension(handlers.ai, handlers.ai.apiRef)]
      : []),
    EditorView.lineWrapping,
    history(),
    drawSelection(),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    syntaxHighlighting(markdownHighlighting),
    pageBreakFlags,
    placeholder('Start writing in Markdown — the paper updates as you type.'),
    // Listed before the default keymaps, so these bindings win.
    keymap.of([
      { key: 'Mod-b', run: toggleBold },
      { key: 'Mod-i', run: toggleItalic },
      { key: 'Mod-k', run: insertLink },
      {
        key: 'Mod-Enter',
        run: () => {
          handlers.onRequestRender();
          return true;
        },
      },
    ]),
    // Image paste/drop (ticket 08). Returning true suppresses CodeMirror's
    // own clipboard handling for these events.
    EditorView.domEventHandlers({
      paste(event) {
        const data = event.clipboardData;
        const files = imageFiles(data?.files);
        // Text on the clipboard wins over attached images (e.g. copying from
        // a web page that ships both).
        if (files.length === 0 || data?.getData('text/plain')) return false;
        event.preventDefault();
        handlers.onImageFiles(files);
        return true;
      },
      drop(event, view) {
        const all = Array.from(event.dataTransfer?.files ?? []);
        if (all.length === 0) return false;
        event.preventDefault();
        const files = all.filter(isImageFile);
        if (files.length > 0) {
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          handlers.onImageFiles(files, pos ?? undefined);
        }
        // Non-image files (.md import, anything else) are claimed but ignored
        // — otherwise CodeMirror's own drop path would insert their text
        // content and race the window-level .md import, which still receives
        // this event.
        return true;
      },
    }),
    keymap.of(historyKeymap),
    keymap.of(defaultKeymap),
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      // Adopted external markdown must not echo back as an edit.
      if (update.transactions.some((tr) => tr.annotation(externalSync))) {
        return;
      }
      handlers.onDocChanged(update.state.doc.toString());
    }),
  ];
}
