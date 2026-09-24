// ─────────────────────────────────────────────────────────────────────────────
// The stylesheet box's proposed-diff view (spec §The review surface, as
// reshaped): while a proposal is pending, the CSS box shows what would change
// in the box's own place — the removed lines struck and faded, the added lines
// solid, the untouched CSS readable around them — with Accept and Reject
// beneath. The paper is showing the proposal meanwhile (the provisional
// render), so this view answers "what would I be accepting"; Accept writes the
// box, Reject flips straight back to the plain box.
//
// One component, two states: the box that edits, and the diff that decides.
// ─────────────────────────────────────────────────────────────────────────────

import { diffLines } from '../ai/line-diff';
import type { LineDiffRow } from '../ai/line-diff';

interface StylesheetBoxDiffProps {
  /** The box as it stood when the request was sent (the diff's "before"). */
  against: string;
  /** The complete proposed stylesheet (the diff's "after"). */
  reply: string;
  /** Whether the box has changed since the proposal was made. */
  stale: boolean;
  onAccept: () => void;
  onReject: () => void;
}

function Row({ row }: { row: LineDiffRow }) {
  if (row.kind === 'same') {
    return (
      <div className="px-2 text-ink-faint">
        <span aria-hidden="true" className="mr-2 select-none">
          {' '}
        </span>
        <span className="whitespace-pre-wrap break-words">{row.text || ' '}</span>
      </div>
    );
  }
  return (
    <div
      className={
        row.kind === 'del'
          ? 'flex gap-2 bg-surface-hover/60 px-2 text-ink-soft line-through decoration-hairline-strong'
          : 'flex gap-2 bg-surface-hover px-2 text-ink'
      }
    >
      <span aria-hidden="true" className="w-3 shrink-0 select-none text-center">
        {row.kind === 'del' ? '−' : '+'}
      </span>
      <span className="whitespace-pre-wrap break-words">{row.text || ' '}</span>
    </div>
  );
}

export function StylesheetBoxDiff({
  against,
  reply,
  stale,
  onAccept,
  onReject,
}: StylesheetBoxDiffProps) {
  const rows = diffLines(against, reply);

  return (
    <div className="flex min-h-32 grow basis-1/2 flex-col">
      <div
        role="status"
        aria-label="Proposed stylesheet"
        data-testid="stylesheet-box-diff"
        className="min-h-0 w-full flex-1 overflow-y-auto rounded-control border border-hairline bg-field px-1 py-1.5 font-mono text-xs leading-5"
      >
        {rows.map((row, index) => (
          <Row key={index} row={row} />
        ))}
      </div>

      <div className="mt-1 flex shrink-0 items-center gap-1">
        {stale ? (
          <p
            role="status"
            data-testid="stylesheet-ai-stale"
            className="text-[11px] leading-4 text-danger"
          >
            The stylesheet changed since this was proposed — ask again to use
            it.
          </p>
        ) : (
          <>
            <button
              type="button"
              data-testid="stylesheet-ai-accept"
              onClick={onAccept}
              className="touch-target inline-flex h-7 items-center rounded-control bg-accent-strong px-3 text-xs font-medium text-accent-ink outline-offset-2 outline-accent transition-colors duration-150 hover:bg-accent-deep focus-visible:outline-2"
            >
              Accept
            </button>
            <button
              type="button"
              data-testid="stylesheet-ai-reject"
              onClick={onReject}
              className="touch-target inline-flex h-7 items-center rounded-control border border-hairline bg-canvas px-3 text-xs font-medium text-ink outline-offset-2 outline-accent transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-2"
            >
              Reject
            </button>
            <p className="ml-auto text-[11px] leading-4 text-ink-faint">
              The paper is showing this proposal.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
