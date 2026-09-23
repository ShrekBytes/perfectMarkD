// ─────────────────────────────────────────────────────────────────────────────
// The first-use disclosure (spec §First-use disclosure): one line stating that
// the submitted text goes to an external AI provider, shown until the account
// has recorded it. It is a notice, not a gate — the request proceeds.
//
// One component for both surfaces (the `/ai` `/ss` popup and the Stylesheet
// tab's AI block), so the promise reads the same wherever it is made.
// ─────────────────────────────────────────────────────────────────────────────

import { Link } from '../router';

export function FirstUseNotice() {
  return (
    <p className="mt-2 text-[11px] leading-4 text-ink-faint">
      Your text is sent to an external AI provider for this action.{' '}
      <Link
        to="/privacy"
        onClick={(event) => event.stopPropagation()}
        className="font-medium text-ink underline decoration-hairline underline-offset-2 outline-offset-2 outline-accent hover:decoration-ink focus-visible:outline-2"
      >
        How your data is handled
      </Link>
    </p>
  );
}
