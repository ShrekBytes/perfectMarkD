// ─────────────────────────────────────────────────────────────────────────────
// The graphite diff (spec §The review surface): monospace lines, `+`/`−`
// gutter marks, soft surface fills for changed lines, and the surrounding
// context. One change at a time — the review dialog stacks them behind a
// checkbox, a Stylesheet proposal card shows the same block inline.
//
// No red/green: chrome carries no accent hue, and `--danger` stays reserved
// for failures.
// ─────────────────────────────────────────────────────────────────────────────

import type { AiChange } from './proposal';

function DiffLine({
  kind,
  text,
}: {
  kind: 'context' | 'del' | 'add';
  text: string;
}) {
  const mark = kind === 'del' ? '−' : kind === 'add' ? '+' : ' ';
  return (
    <div
      className={
        kind === 'del'
          ? 'flex gap-2 bg-surface-hover/60 px-2 text-ink-soft'
          : kind === 'add'
            ? 'flex gap-2 bg-surface-hover px-2 text-ink'
            : 'flex gap-2 px-2 text-ink-faint'
      }
    >
      <span aria-hidden="true" className="w-3 shrink-0 select-none text-center">
        {mark}
      </span>
      <span className="whitespace-pre-wrap break-words">{text || ' '}</span>
    </div>
  );
}

export function AiDiff({ change }: { change: AiChange }) {
  return (
    <div className="mt-1.5 overflow-x-auto rounded-control border border-hairline bg-canvas font-mono text-[11px] leading-5">
      {change.contextBefore.map((line, index) => (
        <DiffLine key={`b${index}`} kind="context" text={line} />
      ))}
      {change.before.map((line, index) => (
        <DiffLine key={`del${index}`} kind="del" text={line} />
      ))}
      {change.after.map((line, index) => (
        <DiffLine key={`add${index}`} kind="add" text={line} />
      ))}
      {change.contextAfter.map((line, index) => (
        <DiffLine key={`a${index}`} kind="context" text={line} />
      ))}
    </div>
  );
}
