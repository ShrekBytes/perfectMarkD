import { useCallback, useEffect, useState } from 'react';
import { navigate } from '../router';
import { ApiError } from '../api/client';
import { Dialog } from '../shell/Dialog';
import { DownloadIcon, SpinnerIcon } from '../shell/icons';
import { downloadHistoryPdf, listHistory, type HistoryEntry } from './api';
import { formatBytes, formatDate } from './format';

interface HistoryDialogProps {
  onClose: () => void;
}

/** Any failure crossing the boundary becomes an ApiError the UI can render. */
function toApiError(cause: unknown): ApiError {
  return cause instanceof ApiError
    ? cause
    : new ApiError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
        0,
      );
}

/**
 * Export History (server/05): the user's Server Export PDFs from the last 30
 * days, re-downloadable. Reached from the account menu. A Premium gate
 * rejection (403) gets its own state — the modal is the one place a Pro user
 * meets the tier difference — while other failures stay retryable.
 */
export function HistoryDialog({ onClose }: HistoryDialogProps) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setEntries(await listHistory());
    } catch (cause) {
      setError(toApiError(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const premiumGated = error?.status === 403;

  const download = async (entry: HistoryEntry): Promise<void> => {
    setDownloadingId(entry.id);
    try {
      await downloadHistoryPdf(entry);
    } catch (cause) {
      setError(toApiError(cause));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Dialog
      label="Export history"
      testId="history-dialog"
      backdropTestId="history-backdrop"
      panelClassName="flex max-h-[85vh] w-full max-w-lg flex-col"
      contentClassName="min-h-0 flex-1 overflow-y-auto"
      onClose={onClose}
    >
      {error && (
        <div className="text-sm">
          <p role="alert" className="text-xs text-danger">
            {error.message}
          </p>
          {premiumGated ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate('/pricing');
              }}
              className="mt-2 h-8 rounded-control border border-hairline bg-canvas px-3 text-xs font-medium text-ink outline-offset-2 outline-accent hover:bg-surface-hover focus-visible:outline-2"
            >
              View plans
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-2 h-8 rounded-control border border-hairline px-3 text-xs text-ink-soft outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {!error && entries === null && (
        <p className="py-6 text-center text-xs text-ink-faint">
          Loading your exports…
        </p>
      )}

      {entries !== null && entries.length === 0 && !error && (
        <div className="py-6 text-center">
          <p className="text-sm text-ink">No exports yet.</p>
          <p className="mx-auto mt-1 max-w-prose text-xs text-ink-soft">
            Server Exports you make on Premium are kept here for 30 days —
            download them again any time. Client Exports stay in your browser
            and never appear here.
          </p>
        </div>
      )}

      {entries !== null && entries.length > 0 && !error && (
        <ul className="space-y-2" data-testid="history-list">
          {entries.map((entry) => (
            <li
              key={entry.id}
              data-testid="history-row"
              className="flex items-center justify-between gap-3 rounded-pane border border-hairline bg-canvas p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  {entry.name}
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {formatDate(entry.createdAt)} · {entry.pages} pages ·{' '}
                  {formatBytes(entry.sizeBytes)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void download(entry)}
                disabled={downloadingId !== null}
                aria-label={`Download ${entry.name}`}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-control border border-hairline px-2.5 text-xs text-ink-soft outline-offset-2 outline-accent transition-colors duration-150 hover:bg-surface-hover hover:text-ink focus-visible:outline-2 disabled:cursor-default disabled:opacity-70"
              >
                {downloadingId === entry.id ? (
                  <SpinnerIcon className="animate-spin" />
                ) : (
                  <DownloadIcon />
                )}
                {downloadingId === entry.id ? 'Preparing…' : 'Download'}
              </button>
            </li>
          ))}
          <li className="pt-1 text-center text-xs text-ink-faint">
            Exports are removed 30 days after they were made.
          </li>
        </ul>
      )}
    </Dialog>
  );
}
