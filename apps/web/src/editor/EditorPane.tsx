import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isolateHistory, redo, undo } from '@codemirror/commands';
import { EditorState, type StateCommand } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { ComponentType, SVGProps } from 'react';
import { MAX_ASSET_BYTES } from '../assets/ingest';
import { useDocumentStore } from '../documents/store';
import { caretAnchorStyle } from '../ai/anchor';
import { AiHintPopover } from '../ai/AiHintPopover';
import { AiPromptPopover } from '../ai/AiPromptPopover';
import { AiReviewDialog } from '../ai/AiReviewDialog';
import { useAiCommand } from '../ai/useAiCommand';
import { PricingModal } from '../pricing/PricingModal';
import {
  BoldIcon,
  HeadingIcon,
  ImageIcon,
  ItalicIcon,
  ListIcon,
  PageBreakIcon,
  RedoIcon,
  TableIcon,
  UndoIcon,
} from '../shell/icons';
import {
  createEditorExtensions,
  editorScrollFraction,
  externalSync,
} from './editor-setup';
import {
  cycleHeading,
  insertAssetImages,
  insertPageBreak,
  insertTable,
  toggleBold,
  toggleBulletList,
  toggleItalic,
  type AssetImage,
} from './markdown-commands';
import { countCharacters, countWords } from './word-count';
import './editor.css';

interface EditorPaneProps {
  /** Ctrl/Cmd+Enter target — the Paper Canvas's manual render (ticket 04). */
  onRequestRender?: () => void;
  /** Proportional editor scroll position for the canvas scroll sync (04). */
  onEditorScroll?: (fraction: number) => void;
}

/** How long the ingest notice (oversized / non-image file) stays visible. */
const NOTICE_MS = 6000;

const MB = 1024 * 1024;

function ToolButton(props: {
  label: string;
  hint?: string;
  onClick?: () => void;
  disabled?: boolean;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  const Icon = props.icon;
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.hint ?? props.label}
      onClick={props.onClick}
      disabled={props.disabled}
      className="touch-target flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <Icon />
    </button>
  );
}

function Divider() {
  return (
    <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-hairline" />
  );
}

/**
 * The markdown editor: slim formatting toolbar, the CodeMirror 6 view, and a
 * word/character footer. The editor is the write path into the store — every
 * document change flows through `updateActive`, and markdown changed elsewhere
 * (doc switch, import, remote adoption) replaces the editor content. Images
 * enter via paste, drop, or the picker and land in the asset store as
 * `![alt](asset://…)` refs (ticket 08).
 */
export function EditorPane({
  onRequestRender,
  onEditorScroll,
}: EditorPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  // Latest props for the closures the one-time editor setup captures.
  const handlers = useRef({ onRequestRender, onEditorScroll });
  handlers.current = { onRequestRender, onEditorScroll };

  // The `/ai` and `/ss` surface (ai-transforms/05). The controller reads AI
  // state from the account store; this pane only renders what it reports.
  const ai = useAiCommand(() => viewRef.current);
  // The editor is built once, so its extension keeps the first render's
  // handlers. These arrows close over a ref instead, so the extension always
  // reaches the current controller even after the account loads.
  const aiHandlersRef = useRef(ai.aiHandlers);
  aiHandlersRef.current = ai.aiHandlers;
  const [pricingOpen, setPricingOpen] = useState(false);

  const markdown = useDocumentStore((state) => state.markdown);
  const stats = useMemo(
    () => ({ words: countWords(markdown), chars: countCharacters(markdown) }),
    [markdown],
  );
  const [notice, setNotice] = useState<string | null>(null);
  // The last text this component pushed out or pulled in; edits from the view
  // must not echo back through the external-sync effect.
  const lastSynced = useRef(markdown);

  /** Paste/drop/picker entry point: stores each file as a local asset and
   *  inserts its markdown ref (at the drop point, else the cursor). Files that
   *  fail ingest surface a notice instead. */
  const handleImageFiles = useCallback((files: File[], pos?: number) => {
    void (async () => {
      const items: AssetImage[] = [];
      let failed: { error: string; name: string } | null = null;
      for (const file of files) {
        const result = await useDocumentStore.getState().addAsset(file);
        if (result.ok) items.push({ ref: result.ref, alt: result.alt });
        else failed = { error: result.error, name: file.name };
      }
      const view = viewRef.current;
      if (items.length > 0 && view) insertAssetImages(items, pos)(view);
      if (failed) {
        const mb = Math.round(MAX_ASSET_BYTES / MB);
        setNotice(
          failed.error === 'too-large'
            ? `"${failed.name}" is over the ${mb} MB image limit and was not added. Use a smaller file.`
            : failed.error === 'unsupported'
              ? `"${failed.name}" is not an image — paste, drop, or pick PNG, JPEG, WebP, SVG, or similar files.`
              : 'Open a document before adding images.',
        );
      }
    })();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const view = new EditorView({
      parent: containerRef.current!,
      state: EditorState.create({
        doc: useDocumentStore.getState().markdown,
        extensions: createEditorExtensions({
          onDocChanged: (text) => {
            lastSynced.current = text;
            useDocumentStore.getState().updateActive({ markdown: text });
          },
          onRequestRender: () => handlers.current.onRequestRender?.(),
          onImageFiles: handleImageFiles,
          ai: {
            enabled: () => aiHandlersRef.current.enabled(),
            onHintChange: (next) => aiHandlersRef.current.onHintChange(next),
            onCommandFired: (context) =>
              aiHandlersRef.current.onCommandFired(context),
            apiRef: ai.editorApiRef,
          },
        }),
      }),
    });
    viewRef.current = view;

    const scrollDOM = view.scrollDOM;
    const reportScroll = () =>
      handlers.current.onEditorScroll?.(editorScrollFraction(scrollDOM));
    scrollDOM.addEventListener('scroll', reportScroll, { passive: true });

    return () => {
      scrollDOM.removeEventListener('scroll', reportScroll);
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Markdown changed outside the editor (doc switch, import, remote adoption):
  // replace the document, isolated from undo history across documents.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || markdown === lastSynced.current) return;
    lastSynced.current = markdown;
    const caret = Math.min(view.state.selection.main.anchor, markdown.length);
    view.dispatch(
      view.state.update({
        changes: { from: 0, to: view.state.doc.length, insert: markdown },
        selection: { anchor: caret },
        annotations: [isolateHistory.of('full'), externalSync.of(true)],
      }),
    );
  }, [markdown]);

  const run = (command: StateCommand) => () => {
    const view = viewRef.current;
    if (view) command(view);
  };

  return (
    <div
      ref={paneRef}
      data-testid="editor-pane"
      /* The AI surfaces anchor to this box, so it is their containing block. */
      className="relative flex h-full min-h-0 flex-col"
    >
      <div
        role="toolbar"
        aria-label="Editor formatting"
        /* min-height + flex-wrap, not a fixed height: at the editor's 280px
           minimum the nine instruments exceed one row, so Undo/Redo would
           clip. Wrapping grows the bar to a second row instead; at desktop
           widths nothing wraps and the bar stays its authored 36px. */
        className="flex min-h-9 shrink-0 flex-wrap items-center gap-x-0.5 gap-y-1 border-b border-hairline px-2"
      >
        <ToolButton
          label="Bold"
          hint="Bold (Ctrl+B)"
          onClick={run(toggleBold)}
          icon={BoldIcon}
        />
        <ToolButton
          label="Italic"
          hint="Italic (Ctrl+I)"
          onClick={run(toggleItalic)}
          icon={ItalicIcon}
        />
        <Divider />
        <ToolButton
          label="Cycle heading level"
          hint="Cycle heading level (plain → H1 → … → H6)"
          onClick={run(cycleHeading)}
          icon={HeadingIcon}
        />
        <ToolButton
          label="Bulleted list"
          hint="Toggle bulleted list"
          onClick={run(toggleBulletList)}
          icon={ListIcon}
        />
        <Divider />
        <ToolButton
          label="Insert table"
          hint="Insert a 3-column starter table"
          onClick={run(insertTable)}
          icon={TableIcon}
        />
        <ToolButton
          label="Insert image"
          hint="Insert image (paste or drop an image also works)"
          onClick={() => pickerRef.current?.click()}
          icon={ImageIcon}
        />
        <ToolButton
          label="Insert Page Break"
          hint="Insert Page Break (/// on its own line)"
          onClick={run(insertPageBreak)}
          icon={PageBreakIcon}
        />
        <div className="ml-auto flex items-center gap-0.5">
          <ToolButton
            label="Undo"
            hint="Undo (Ctrl+Z)"
            onClick={run(undo)}
            icon={UndoIcon}
          />
          <ToolButton
            label="Redo"
            hint="Redo (Ctrl+Shift+Z)"
            onClick={run(redo)}
            icon={RedoIcon}
          />
        </div>
      </div>

      <div ref={containerRef} className="pm-editor min-h-0 flex-1" />

      {ai.hint && (
        <AiHintPopover
          hint={ai.hint}
          style={caretAnchorStyle(
            viewRef.current,
            ai.hint.from,
            paneRef.current,
          )}
          onAccept={() => ai.editorApiRef.current?.acceptHint()}
        />
      )}

      {ai.popup && ai.promptScope && ai.account && (
        <AiPromptPopover
          command={ai.popup.command}
          scope={ai.promptScope}
          ai={ai.account}
          gate={ai.gate}
          request={ai.request}
          initialInstruction={ai.popup.instruction}
          style={caretAnchorStyle(
            viewRef.current,
            ai.popup.at,
            paneRef.current,
          )}
          onSubmit={ai.submit}
          onCancel={ai.cancel}
          onOpenPricing={() => setPricingOpen(true)}
        />
      )}

      {notice && (
        <p
          role="status"
          className="shrink-0 border-t border-hairline px-3 py-1.5 text-xs text-danger"
        >
          {notice}
        </p>
      )}

      <footer
        data-testid="editor-stats"
        className="flex h-7 shrink-0 select-none items-center border-t border-hairline px-3 text-xs text-ink-faint"
      >
        {stats.words.toLocaleString('en-US')} words ·{' '}
        {stats.chars.toLocaleString('en-US')} characters
      </footer>

      <input
        ref={pickerRef}
        data-testid="image-picker"
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          handleImageFiles(files);
        }}
      />

      {ai.review && ai.changeSet && (
        // Keyed on the proposal's nonce: a Retry returns a new one, and the
        // dialog's own state (which changes are checked, whether the long diff
        // is expanded) must start fresh rather than carry over.
        <AiReviewDialog
          key={ai.review.nonce}
          command={ai.review.command}
          changeSet={ai.changeSet}
          disabledReason={ai.acceptDisabledReason}
          busy={ai.request.status === 'working'}
          retryBlocked={ai.retryBlocked}
          error={ai.request.status === 'error' ? ai.request.message : null}
          onAccept={ai.accept}
          onReject={ai.reject}
          onRetry={ai.retry}
          onEditPrompt={ai.editPrompt}
        />
      )}

      {pricingOpen && <PricingModal onClose={() => setPricingOpen(false)} />}
    </div>
  );
}
