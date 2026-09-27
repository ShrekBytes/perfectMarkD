// ─────────────────────────────────────────────────────────────────────────────
// The chrome both one-time-link pages share: how a link's token is read out of
// the address bar, and the panel its states are rendered in.
//
// /verify-email (Email Verification) and /set-password (Password Reset) are the
// same shape — a heading, a sentence or two, one action — and they must answer a
// dead link with the same words, so the words and the geometry live here rather
// than in each page (see DESIGN.md: the auth surface's chrome is decided once).
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react';

export const COPY_CLASS = 'mt-1 text-xs leading-relaxed text-ink-soft';

/** The token travels in the query string the emailed link carries. */
export function tokenFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('token');
}

/** The heading-and-copy frame every state of a link page is rendered in. */
export function Panel({
  heading,
  children,
}: {
  heading: string;
  children?: ReactNode;
}) {
  return (
    <>
      <h1 className="text-lg font-semibold tracking-tight">{heading}</h1>
      {children}
    </>
  );
}
