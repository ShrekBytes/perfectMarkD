// ─────────────────────────────────────────────────────────────────────────────
// The chrome the standalone auth surfaces share: the static pages' header (a
// header that drifts between surfaces is a header that stops matching) and the
// job jacket — the proof-sheet panel with the registration marks, which DESIGN.md
// reserves for this surface: the one chrome a user meets outside the editor.
//
// /login, /register, /check-inbox, /verify-email, /reset-password,
// /set-password and /confirm-email-change all render inside it, so the marks
// and the panel geometry are decided once.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react';
import { Link } from '../router';
import { PageHeader } from '../pages/PageHeader';

export function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-canvas text-ink">
      <PageHeader />
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="pm-reg-marks relative w-full max-w-sm rounded-pane border border-hairline bg-surface">
          <span className="pm-reg-host absolute inset-0" aria-hidden="true" />
          <div className="p-6">{children}</div>
        </div>
      </main>
    </div>
  );
}

/** The way out of a verification step: the sign-in form, always one click. */
export function SignInFooter({ children }: { children: ReactNode }) {
  return (
    <p className="mt-5 border-t border-hairline pt-3 text-center text-xs text-ink-soft">
      {children}{' '}
      <Link
        to="/login"
        className="touch-target rounded-control px-1 text-ink underline underline-offset-2 outline-offset-2 outline-accent hover:text-ink focus-visible:outline-2"
      >
        Sign in
      </Link>
    </p>
  );
}
