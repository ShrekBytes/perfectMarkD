import { useEffect, useRef, useState } from 'react';
import { formatRelativeTime } from '../documents/text';
import { useDocumentStore } from '../documents/store';
import {
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  UploadIcon,
} from '../shell/icons';
import { downloadMarkdown } from './download';

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

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
        role="dialog"
        aria-label="Library"
        data-testid="library-panel"
        className="animate-slide-in-left fixed inset-y-0 left-0 z-50 flex w-84 flex-col border-r border-hairline bg-surface shadow-xl"
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
          <button
            type="button"
            onClick={() => void createDocument().then(onClose)}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-control bg-accent px-3 text-sm font-medium text-accent-ink shadow-sm transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-strong focus-visible:outline-2"
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
                        cancelled.current = true;
                        event.currentTarget.blur();
                      }
                    }}
                    className="min-w-0 flex-1 rounded-control border border-accent bg-page px-2 py-1.5 text-sm text-ink outline-none"
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
                    <span className="text-xs text-ink-faint">
                      {formatRelativeTime(row.updatedAt)}
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
            <li className="px-3 py-8 text-center text-xs text-ink-faint">
              No documents yet. Create one or import a .md file.
            </li>
          )}
        </ul>
      </aside>
    </>
  );
}
