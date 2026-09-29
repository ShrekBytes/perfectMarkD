import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, errorToUserMessage } from '../api/client';
import { Link } from '../router';
import { AuthPageShell } from './AuthPageShell';
import { COPY_CLASS, Panel, tokenFromUrl } from './link-page';
import { LINK_INVALID_CODE, resetPassword } from './api';
import { INPUT_CLASS, PASSWORD_MIN, passwordHint } from './field';

/** The form renders once per page, so the IDs are stable and unique. */
const HINT_ID = 'set-password-hint';
const ERROR_ID = 'set-password-error';

const BUTTON_CLASS =
  'touch-target mt-4 flex h-9 w-full items-center justify-center rounded-control bg-accent-strong text-sm font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2 disabled:opacity-60';

/** A full-width ghost target for the way out of a dead link. The `flex` is not
 *  decoration: an anchor is inline by default, so the height, width, and border
 *  below do nothing without it. */
const LINK_BUTTON_CLASS =
  'touch-target mt-4 flex h-9 w-full items-center justify-center rounded-control border border-hairline text-sm font-medium text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2';

type State =
  | { kind: 'form' }
  | { kind: 'set' }
  /** The link is dead — expired, already spent, or mistyped. All three recover
   *  the same way, and the server says the same thing about all three. */
  | { kind: 'dead' }
  | { kind: 'no-token' };

/** What a failed request shows: the message, and whether it was the input. */
interface Failure {
  message: string;
  fieldError: boolean;
}

/**
 * The page a Password Reset link resolves to (email/03). It sets a new password
 * without signing in: the link is the proof, and signing in again is the last
 * step, not a side effect.
 *
 * The token is spent when a password is chosen, never on load — an inbox link
 * scanner follows every URL it sees, and a one-time link spent by a scanner is
 * a link the person who asked for it cannot use. It is read from the address bar
 * once, then taken out of it: a bearer credential has no business in history or
 * in a Referer, and leaving it there means Back can re-spend a spent link.
 */
export function SetPasswordPage() {
  // Read once, on the first render, before the effect below clears the URL.
  const [token] = useState(tokenFromUrl);
  const [state, setState] = useState<State>(() =>
    token ? { kind: 'form' } : { kind: 'no-token' },
  );
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    window.history.replaceState({}, '', '/set-password');
  }, [token]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);

    // Client-side first: a too-short or unconfirmed password is the user's
    // input, and this link is often the only way they have in.
    if (next.length < PASSWORD_MIN) {
      setFailure({
        message: `New password must be at least ${PASSWORD_MIN} characters.`,
        fieldError: true,
      });
      return;
    }
    if (confirm !== next) {
      setFailure({
        message: 'The new passwords don’t match.',
        fieldError: true,
      });
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(token ?? '', next);
      setState({ kind: 'set' });
    } catch (cause) {
      // A dead link is its own state, with its own recovery; anything else is a
      // failed request the form stays open for — a 5xx must not read as a
      // verdict on the link, and the password the user typed is worth keeping.
      if (cause instanceof ApiError && cause.code === LINK_INVALID_CODE) {
        setState({ kind: 'dead' });
      } else {
        setFailure({
          message: errorToUserMessage(cause),
          // The only server-side refusal here is the policy, which is about the
          // input; a 5xx or a body we could not read is ours, and flagging a
          // field for it would point the user at the wrong thing.
          fieldError: cause instanceof ApiError && cause.status === 400,
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (state.kind === 'set') {
    return (
      <AuthPageShell>
        <Panel heading="Your password is set">
          <p className={COPY_CLASS}>
            Sign in with it now. Every other device signed in to this account
            has been signed out, so a session taken before the reset is gone.
          </p>
          <Link to="/login" autoFocus className={BUTTON_CLASS}>
            Sign in
          </Link>
        </Panel>
      </AuthPageShell>
    );
  }

  if (state.kind === 'dead') {
    return (
      <AuthPageShell>
        <Panel heading="That link has expired">
          <p className={COPY_CLASS}>
            Reset links work once and last 30 minutes. Ask for a new one and
            open that instead.
          </p>
          <Link to="/reset-password" className={LINK_BUTTON_CLASS}>
            Request a new link
          </Link>
        </Panel>
      </AuthPageShell>
    );
  }

  if (state.kind === 'no-token') {
    return (
      <AuthPageShell>
        <Panel heading="This link is incomplete">
          <p className={COPY_CLASS}>
            Reset links carry a one-time code. Open the one in your email — or
            ask for a new link.
          </p>
          <Link to="/reset-password" className={LINK_BUTTON_CLASS}>
            Request a new link
          </Link>
        </Panel>
      </AuthPageShell>
    );
  }

  const hint = passwordHint(next.length);
  // Both fields carry the same message (the policy, or the mismatch), so both
  // point at it: a mismatch flagged on one field reads as "that one is wrong".
  const describedBy =
    [HINT_ID, failure ? ERROR_ID : null].filter(Boolean).join(' ') || undefined;

  return (
    <AuthPageShell>
      <Panel heading="Choose a new password">
        <p className={COPY_CLASS}>
          This link works once and lasts 30 minutes. Choosing a password signs
          out every device on this account.
        </p>

        <form
          onSubmit={(event) => void onSubmit(event)}
          // With JS broken this would otherwise GET, putting the password in
          // the URL and any request log. A failed POST is the safer failure.
          method="post"
          data-testid="set-password-form"
          className="mt-4"
        >
          <label className="block text-xs font-medium text-ink-soft">
            New password
            <input
              type="password"
              name="newPassword"
              autoComplete="new-password"
              required
              // No minLength, like the Account page's change-password form: a
              // native bubble would pre-empt the styled message and the
              // countdown hint, so this form has one way of saying it.
              aria-invalid={failure?.fieldError ? true : undefined}
              aria-describedby={describedBy}
              value={next}
              onChange={(event) => setNext(event.target.value)}
              className={INPUT_CLASS}
            />
          </label>

          <p
            id={HINT_ID}
            role="status"
            className="mt-1 text-[11px] text-ink-faint"
          >
            {hint}
          </p>

          <label className="mt-3 block text-xs font-medium text-ink-soft">
            Confirm new password
            <input
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              required
              aria-invalid={failure?.fieldError ? true : undefined}
              aria-describedby={describedBy}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className={INPUT_CLASS}
            />
          </label>

          {failure && (
            <p id={ERROR_ID} role="alert" className="mt-3 text-xs text-danger">
              {failure.message}
            </p>
          )}

          <button type="submit" disabled={submitting} className={BUTTON_CLASS}>
            {submitting ? 'Setting…' : 'Set password'}
          </button>
        </form>
      </Panel>
    </AuthPageShell>
  );
}
