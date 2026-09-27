import { useEffect, useRef, useState } from 'react';
import { ApiError, errorToUserMessage } from '../api/client';
import { Link } from '../router';
import { AuthPageShell, SignInFooter } from './AuthPageShell';
import { COPY_CLASS, Panel, tokenFromUrl } from './link-page';
import { EMAIL_TAKEN_CODE, LINK_INVALID_CODE, confirmEmailChange } from './api';
import { useAccountStore } from './account-store';

type State =
  | { kind: 'working' }
  | { kind: 'changed'; email: string }
  /** The link is dead — expired, already spent, or mistyped. */
  | { kind: 'dead' }
  /** The new address is spoken for, and only the request can fix that. */
  | { kind: 'taken'; message: string }
  | { kind: 'failed'; message: string }
  | { kind: 'no-token' };

const LINK_BUTTON_CLASS =
  'touch-target mt-4 flex h-9 w-full items-center justify-center rounded-control border border-hairline text-sm font-medium text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2';

/** The way back to the form that asked for this link. */
function backToAccount(label: string) {
  return (
    <Link to="/account" className={LINK_BUTTON_CLASS}>
      {label}
    </Link>
  );
}

/**
 * The page an email-change link resolves to (email/04). Following it is what
 * moves the account, so the token is spent on arrival — the same as a
 * verification link, because the recovery is one click either way: the Account
 * page asks for a new link.
 *
 * The password confirmation happened where the link was asked for, so nothing
 * here is a second gate: this page's whole job is to spend the link honestly and
 * to say which of the three things happened — the change, a dead link, or an
 * address another account has since claimed.
 */
export function ConfirmEmailChangePage() {
  const refresh = useAccountStore((state) => state.refresh);
  const [state, setState] = useState<State>({ kind: 'working' });
  // The token is spent once per page load, and once per page load only: React's
  // development double-mount runs effects twice, which would spend a one-time
  // link on the first pass and then read the second answer on a change that
  // actually worked.
  const spent = useRef(false);

  useEffect(() => {
    const token = tokenFromUrl();
    if (!token) {
      setState({ kind: 'no-token' });
      return;
    }
    // Out of the address bar before the request: a token is a bearer
    // credential, and leaving it in the URL puts it in this tab's history and
    // in any Referer the page goes on to send. It also means Back does not
    // re-spend it and tell a user whose change worked that it expired.
    window.history.replaceState({}, '', '/confirm-email-change');
    if (spent.current) return;
    spent.current = true;
    confirmEmailChange(token)
      .then((user) => {
        // Whoever followed the link, the account's identity moved — so
        // re-read it rather than leaving a stale address on screen.
        void refresh();
        setState({ kind: 'changed', email: user.email });
      })
      .catch((cause: unknown) => {
        setState(
          cause instanceof ApiError && cause.code === LINK_INVALID_CODE
            ? { kind: 'dead' }
            : cause instanceof ApiError && cause.code === EMAIL_TAKEN_CODE
              ? { kind: 'taken', message: cause.message }
              : { kind: 'failed', message: errorToUserMessage(cause) },
        );
      });
  }, [refresh]);

  return (
    <AuthPageShell>
      {state.kind === 'working' && (
        <Panel heading="Changing your login email">
          <p role="status" className={COPY_CLASS}>
            One moment…
          </p>
        </Panel>
      )}

      {state.kind === 'changed' && (
        <Panel heading="Your login email changed">
          <p className={COPY_CLASS}>
            Your account now signs in with{' '}
            <span
              data-testid="changed-email"
              className="font-mono font-medium text-ink"
            >
              {state.email}
            </span>
            . Your password, plan, and documents are unchanged.
          </p>
          {backToAccount('Back to your account')}
        </Panel>
      )}

      {state.kind === 'dead' && (
        <Panel heading="That link has expired">
          <p className={COPY_CLASS}>
            Email-change links work once and last 24 hours. Nothing has changed
            — ask for a new one and open that instead.
          </p>
          {backToAccount('Ask for a new link')}
        </Panel>
      )}

      {state.kind === 'taken' && (
        <Panel heading="That address is already in use">
          <p role="alert" className="mt-1 text-xs text-danger">
            {state.message}
          </p>
          {/* The one fact the server's own message does not carry. */}
          <p className={COPY_CLASS}>Your login email has not changed.</p>
          {backToAccount('Try another address')}
        </Panel>
      )}

      {state.kind === 'failed' && (
        <Panel heading="We couldn’t confirm that">
          <p role="alert" className="mt-1 text-xs text-danger">
            {state.message}
          </p>
          <p className={COPY_CLASS}>
            Your login email has not changed. If this keeps happening, ask for a
            new link.
          </p>
          {backToAccount('Back to your account')}
        </Panel>
      )}

      {state.kind === 'no-token' && (
        <Panel heading="This link is incomplete">
          <p className={COPY_CLASS}>
            Email-change links carry a one-time code. Open the one in your email
            — or ask for a new one.
          </p>
          {backToAccount('Ask for a new link')}
        </Panel>
      )}

      <SignInFooter>Nothing to confirm?</SignInFooter>
    </AuthPageShell>
  );
}
