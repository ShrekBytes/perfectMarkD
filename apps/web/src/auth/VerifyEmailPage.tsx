import { useEffect, useRef, useState } from 'react';
import { ApiError, errorToUserMessage } from '../api/client';
import { navigate } from '../router';
import { AuthPageShell, SignInFooter } from './AuthPageShell';
import { COPY_CLASS, Panel, tokenFromUrl } from './link-page';
import { ResendVerification } from './ResendVerification';
import { LINK_INVALID_CODE, verifyEmail } from './api';
import { useAccountStore } from './account-store';

type State =
  | { kind: 'working' }
  | { kind: 'verified' }
  /** The link is dead — expired, already spent, or mistyped. All three recover
   *  the same way, and the server says the same thing about all three. */
  | { kind: 'dead' }
  | { kind: 'failed'; message: string }
  | { kind: 'no-token' };

/**
 * The page a verification link resolves to (email/02). It spends the token over
 * the API rather than on load: an inbox link scanner follows every URL it sees,
 * and a token spent by the scanner would lock out the person who asked for it.
 *
 * Success signs the user in — following the link is the proof, so nobody has to
 * type the password again.
 */
export function VerifyEmailPage() {
  const signedIn = useAccountStore((state) => state.signedIn);
  const [state, setState] = useState<State>({ kind: 'working' });
  // The token is spent once per page load, and once per page load only: React's
  // development double-mount runs effects twice, which would spend a one-time
  // link on the first pass and then read the second answer — "expired" — on a
  // verification that actually succeeded.
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
    // re-spend it and tell a user who just verified that it expired.
    window.history.replaceState({}, '', '/verify-email');
    if (spent.current) return;
    spent.current = true;
    verifyEmail(token)
      .then((user) => {
        signedIn(user);
        setState({ kind: 'verified' });
      })
      .catch((cause: unknown) => {
        setState(
          cause instanceof ApiError && cause.code === LINK_INVALID_CODE
            ? { kind: 'dead' }
            : { kind: 'failed', message: errorToUserMessage(cause) },
        );
      });
  }, [signedIn]);

  return (
    <AuthPageShell>
      {state.kind === 'working' && (
        <Panel heading="Verifying your address">
          <p role="status" className={COPY_CLASS}>
            One moment…
          </p>
        </Panel>
      )}

      {state.kind === 'verified' && (
        <Panel heading="Your address is verified">
          <p className={COPY_CLASS}>
            You’re signed in. A paid plan and Server Export are waiting on the
            Account page.
          </p>
          <button
            type="button"
            autoFocus
            onClick={() => navigate('/')}
            className="touch-target mt-5 h-9 w-full rounded-control bg-accent-strong text-sm font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2"
          >
            Open the editor
          </button>
        </Panel>
      )}

      {state.kind === 'dead' && (
        <Panel heading="That link has expired">
          <p className={COPY_CLASS}>
            Verification links work once and last 24 hours. Send yourself a new
            one and open that instead.
          </p>
          <ResendVerification />
        </Panel>
      )}

      {state.kind === 'failed' && (
        <Panel heading="We couldn’t verify that">
          <p role="alert" className="mt-1 text-xs text-danger">
            {state.message}
          </p>
          <ResendVerification />
        </Panel>
      )}

      {state.kind === 'no-token' && (
        <Panel heading="This link is incomplete">
          <p className={COPY_CLASS}>
            Verification links carry a one-time code. Open the one in your email
            — or ask for a new link below.
          </p>
          <ResendVerification />
        </Panel>
      )}

      <SignInFooter>Nothing to verify?</SignInFooter>
    </AuthPageShell>
  );
}
