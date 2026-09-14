import { useRef, useState } from 'react';
import { formatPageCount, formatRelativeTime } from '../documents/text';
import { useDocumentStore } from '../documents/store';
import { PresetThumb } from '../inspector/PresetThumb';
import {
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  PagesIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  UploadIcon,
} from '../shell/icons';
import { EmptyState } from '../shell/EmptyState';
import { useEscapeLayer, useModalFocus } from '../shell/focus';
import { downloadMarkdown } from './download';
import { thumbFootprint } from './thumb';

interface LibraryPanelProps {
  onClose: () => void;
}

const iconButton =
  'flex h-7 w-7 items-center justify-center rounded-control text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2';

/**
 * The Library: a slide-in drawer listing the local documents, with create /
 * import / rename / duplicate / export / delete(undo) actions.
 */
export function LibraryPanel({ onClose }: LibraryPanelProps) {
  const docs = useDocumentStore((state) => state.docs);
  const activeId = useDocumentStore((state) => state.activeId);
  const createDocument = useDocumentStore((state) => state.createDocument);
  const openDocument = useDocumentStore((state) => state.openDocument);
  const renameDocument = useDocumentStore((state) => state.renameDocument);
  const duplicateDocument = useDocumentStore(
    (state) => state.duplicateDocument,
  );
  const deleteDocument = useDocumentStore((state) => state.deleteDocument);
  const exportDocument = useDocumentStore((state) => state.exportDocument);
  const importDocument = useDocumentStore((state) => state.importDocument);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const cancelled = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  // Modal-layer plumbing: Escape resolves the topmost layer only, Tab stays
  // inside the drawer, and closing returns focus to what opened it.
  useEscapeLayer(true, onClose);
  useModalFocus(panelRef, true);

  const commitRename = (id: string, currentName: string) => {
    const name = draft.trim();
    setRenamingId(null);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (name && name !== currentName) void renameDocument(id, name);
  };

  const handleImportChosen = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    void file
      .text()
      .then((markdown) => importDocument(file.name, markdown))
      .then(onClose);
  };

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className="animate-fade-in fixed inset-0 z-40 bg-black/25"
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Library"
        data-testid="library-panel"
        tabIndex={-1}
        className="animate-slide-in-left fixed inset-y-0 left-0 z-50 flex w-84 flex-col border-r border-hairline bg-surface shadow-xl outline-none"
      >
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-hairline pl-4 pr-2">
          <h2 className="text-sm font-semibold">Library</h2>
          <button
            type="button"
            aria-label="Close Library"
            title="Close Library"
            onClick={onClose}
            className={iconButton}
          >
            <CloseIcon />
          </button>
        </header>

        <div className="flex shrink-0 gap-2 border-b border-hairline p-3">
          {/* Ghost, not primary: the top-bar Export split button is the only
              violet fill (DESIGN.md Reserved Violet Rule). Same ghost ladder
              as the "Import .md" button below. */}
          <button
            type="button"
            onClick={() => void createDocument().then(onClose)}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-control border border-hairline px-3 text-sm text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
          >
            <PlusIcon />
            New document
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-8 items-center justify-center gap-1.5 rounded-control border border-hairline px-3 text-sm text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
          >
            <UploadIcon />
            Import .md
          </button>
          <input
            ref={fileInputRef}
            type="file"
            aria-label="Import markdown file"
            accept=".md,.markdown,text/markdown"
            className="hidden"
            onChange={(event) => {
              handleImportChosen(event.target.files);
              event.target.value = '';
            }}
          />
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {docs.map((row) => {
            const isActive = row.id === activeId;
            const renaming = renamingId === row.id;
            return (
              <li
                key={row.id}
                aria-current={isActive ? 'true' : undefined}
                className={`group flex items-center gap-1 rounded-control p-1 ${
                  isActive ? 'bg-accent-soft' : 'hover:bg-surface-hover'
                }`}
              >
                {/* The leading miniature sheet: a sketch from the document's
                    own settings snapshot, its aspect from its paper. Leading
                    the row (not inside the name block) so it stays put while
                    the name becomes a rename input. */}
                <PresetThumb
                  style={row.settings}
                  {...thumbFootprint(row.settings)}
                />
                {renaming ? (
                  <input
                    autoFocus
                    aria-label="Rename document"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={() => commitRename(row.id, row.name)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                      else if (event.key === 'Escape') {
                        // Shield the layer stack: Escape here cancels the
                        // rename; it must not also close the Library.
                        event.stopPropagation();
                        cancelled.current = true;
                        event.currentTarget.blur();
                      }
                    }}
                    className="min-w-0 flex-1 rounded-control border border-accent bg-field px-2 py-1.5 text-sm text-ink outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    aria-label={`Open ${row.name}`}
                    title={row.name}
                    onClick={() => void openDocument(row.id).then(onClose)}
                    onDoubleClick={() => {
                      setDraft(row.name);
                      setRenamingId(row.id);
                    }}
                    className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-control px-2 py-1.5 text-left outline-offset-2 outline-accent focus-visible:outline-2"
                  >
                    <span className="max-w-full truncate text-sm font-medium text-ink">
                      {row.name}
                    </span>
                    <span
                      data-testid="row-meta"
                      className="text-xs text-ink-faint tabular-nums"
                    >
                      {formatRelativeTime(row.updatedAt)}
                      {row.pageCount !== null &&
                        ` · ${formatPageCount(row.pageCount)}`}
                    </span>
                  </button>
                )}

                {!renaming && (
                  <div className="flex shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                      type="button"
                      aria-label={`Rename ${row.name}`}
                      title="Rename"
                      onClick={() => {
                        setDraft(row.name);
                        setRenamingId(row.id);
                      }}
                      className={iconButton}
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      aria-label={`Duplicate ${row.name}`}
                      title="Duplicate"
                      onClick={() => void duplicateDocument(row.id)}
                      className={iconButton}
                    >
                      <CopyIcon />
                    </button>
                    <button
                      type="button"
                      aria-label={`Export ${row.name}`}
                      title="Export .md"
                      onClick={() => {
                        void exportDocument(row.id).then((payload) => {
                          if (payload)
                            downloadMarkdown(
                              payload.fileName,
                              payload.markdown,
                            );
                        });
                      }}
                      className={iconButton}
                    >
                      <DownloadIcon />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${row.name}`}
                      title="Delete"
                      onClick={() => void deleteDocument(row.id)}
                      className={`${iconButton} hover:text-danger`}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
          {docs.length === 0 && (
            <li className="pt-6">
              {/* The shell's empty-state pattern, not a bare line: the drawer
                  at zero documents is a first-run moment, not an afterthought. */}
              <EmptyState
                icon={<PagesIcon />}
                title="No documents yet"
                hint="Create a new document or import a .md file."
              />
            </li>
          )}
        </ul>
      </aside>
    </>
  );
}
