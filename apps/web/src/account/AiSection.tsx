// ─────────────────────────────────────────────────────────────────────────────
// The Account page's AI section (ai-transforms/05): the remaining AI Actions
// for the current period beside the Server Export Quota, and the AI Access
// switch. Both read the `ai` block /api/me reports and write back through the
// account store, so the page holds no AI state of its own.
//
// On an instance with no provider configured the section renders nothing at
// all (spec §Gate precedence, step 1): advertising a feature the operator
// cannot serve is worse than not having it.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { errorToMessage } from '../api/client';
import { Link } from '../router';
import { ToggleRow } from '../inspector/controls';
import { resetDate } from '../ai/format';
import { useAccountStore, useAiState } from '../auth/account-store';

export function AiSection() {
  const ai = useAiState();
  const setAiAccess = useAccountStore((state) => state.setAiAccess);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!ai?.configured) return null;

  const toggle = (next: boolean) => {
    setError(null);
    setSaving(true);
    void setAiAccess(next)
      .catch((cause: unknown) => setError(errorToMessage(cause)))
      .finally(() => setSaving(false));
  };

  return (
    <section
      aria-labelledby="account-ai-heading"
      className="rounded-pane border border-hairline bg-surface p-4 sm:p-5"
    >
      <h2
        id="account-ai-heading"
        className="text-base font-semibold tracking-tight text-ink"
      >
        AI Actions
      </h2>

      {ai.included ? (
        <>
          <div className="mt-4">
            <p className="text-xs font-medium text-ink-soft">
              AI Actions remaining
            </p>
            <p
              data-testid="account-ai-remaining"
              className="mt-0.5 font-mono text-xs text-ink tabular-nums"
            >
              {ai.remaining} of {ai.allowance} left this month · resets{' '}
              {resetDate(ai.resetsAt)}
            </p>
          </div>

          <div className="mt-4">
            <ToggleRow
              checked={ai.access}
              disabled={saving}
              onChange={toggle}
              label="AI Access"
            />
            <p className="mt-1 text-[11px] leading-4 text-ink-faint">
              {ai.access
                ? 'On. /ai and /ss send the text you submit to an external AI provider.'
                : 'Off. The /ai and /ss commands are hidden in the editor.'}
            </p>
          </div>
        </>
      ) : (
        <div className="mt-3">
          <p className="max-w-prose text-xs text-ink-soft">
            AI Actions are part of Pro and Premium. They send the text you
            submit to an external AI provider; nothing is stored here.
          </p>
          <Link
            to="/pricing"
            className="touch-target mt-3 inline-flex h-8 items-center rounded-control border border-hairline bg-canvas px-3 text-xs font-medium text-ink outline-offset-2 outline-accent transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-2"
          >
            View plans
          </Link>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-[11px] leading-4 text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
