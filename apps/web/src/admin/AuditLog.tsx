import { useCallback, useEffect, useState } from 'react';
import { listAuditEntries, type AuditEntry } from './api';

function entryTime(iso: string): string {
  const date = new Date(iso);
  return `${iso.slice(0, 10)} ${date.toISOString().slice(11, 16)} UTC`;
}

/** Compact, stable JSON for the before/after snapshots. */
function snapshot(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/**
 * The admin audit trail (billing/02): every decision and settings change,
 * with the timestamp, who acted, and what changed. Append-only by design —
 * the panel only reads it.
 */
export function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setEntries(await listAuditEntries());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div>
      {error && (
        <div className="text-sm">
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
          <button
            type="button"
            data-testid="audit-retry"
            onClick={() => void refresh()}
            className="mt-2 h-8 rounded-control border border-hairline px-3 text-xs text-ink-soft outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
          >
            Retry
          </button>
        </div>
      )}

      {!error && entries === null && (
        <p className="py-6 text-center text-xs text-ink-faint">
          Loading the audit log…
        </p>
      )}

      {!error && entries !== null && entries.length === 0 && (
        <p
          data-testid="audit-empty"
          className="py-6 text-center text-xs text-ink-soft"
        >
          No admin actions recorded yet.
        </p>
      )}

      {!error && entries !== null && entries.length > 0 && (
        <ul className="space-y-2" data-testid="audit-list">
          {entries.map((entry) => (
            <li
              key={entry.id}
              data-testid="audit-row"
              className="rounded-pane border border-hairline bg-surface p-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs font-medium text-ink">
                  {entry.action}
                  <span className="ml-2 font-normal text-ink-soft">
                    {entry.targetType === 'order'
                      ? `Order #${entry.targetId}`
                      : `${entry.targetType}: ${entry.targetId}`}
                  </span>
                </p>
                <p className="shrink-0 font-mono text-xs text-ink-faint">
                  {entryTime(entry.createdAt)}
                </p>
              </div>
              <p className="mt-0.5 text-xs text-ink-faint">
                by {entry.adminEmail}
              </p>
              <p className="mt-1.5 break-all font-mono text-xs text-ink-soft">
                <span className="text-ink-faint">before </span>
                {snapshot(entry.before)}
              </p>
              <p className="break-all font-mono text-xs text-ink-soft">
                <span className="text-ink-faint">after </span>
                {snapshot(entry.after)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
