import { useEffect, useMemo, useRef } from 'react';
import { isolateHistory, redo, undo } from '@codemirror/commands';
import { EditorState, type StateCommand } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { ComponentType, SVGProps } from 'react';
import { useDocumentStore } from '../documents/store';
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
import { createEditorExtensions, editorScrollFraction } from './editor-setup';
import {
  cycleHeading,
  insertPageBreak,
  insertTable,
  toggleBold,
  toggleBulletList,
  toggleItalic,
} from './markdown-commands';
import { countCharacters, countWords } from './word-count';
import './editor.css';

interface EditorPaneProps {
  /** Ctrl/Cmd+Enter target — the Paper Canvas's manual render (ticket 04). */
  onRequestRender?: () => void;
  /** Image picker (ticket 08); absent until image handling ships. */
  onPickImage?: () => void;
  /** Proportional editor scroll position for the canvas scroll sync (04). */
  onEditorScroll?: (fraction: number) => void;
}

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
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
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
 * (doc switch, import, remote adoption) replaces the editor content.
 */
export function EditorPane({
  onRequestRender,
  onPickImage,
  onEditorScroll,
}: EditorPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Latest props for the closures the one-time editor setup captures.
  const handlers = useRef({ onRequestRender, onEditorScroll });
  handlers.current = { onRequestRender, onEditorScroll };

  const markdown = useDocumentStore((state) => state.markdown);
  const stats = useMemo(
    () => ({ words: countWords(markdown), chars: countCharacters(markdown) }),
    [markdown],
  );
  // The last text this component pushed out or pulled in; edits from the view
  // must not echo back through the external-sync effect.
  const lastSynced = useRef(markdown);

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
        annotations: isolateHistory.of('full'),
      }),
    );
  }, [markdown]);

  const run = (command: StateCommand) => () => {
    const view = viewRef.current;
    if (view) command(view);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        role="toolbar"
        aria-label="Editor formatting"
        className="flex h-9 shrink-0 items-center gap-0.5 border-b border-hairline px-2"
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
          onClick={run(toggleBulletList)}
          icon={ListIcon}
        />
        <Divider />
        <ToolButton
          label="Insert table"
          onClick={run(insertTable)}
          icon={TableIcon}
        />
        <ToolButton
          label="Insert image"
          hint={onPickImage ? 'Insert image' : 'Images — coming soon'}
          onClick={onPickImage}
          disabled={!onPickImage}
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

      <footer
        data-testid="editor-stats"
        className="flex h-7 shrink-0 select-none items-center border-t border-hairline px-3 text-xs text-ink-faint"
      >
        {stats.words.toLocaleString('en-US')} words ·{' '}
        {stats.chars.toLocaleString('en-US')} characters
      </footer>
    </div>
  );
}
