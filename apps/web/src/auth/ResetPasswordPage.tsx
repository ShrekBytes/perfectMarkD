import { useState, type FormEvent } from 'react';
import { ApiError, errorToUserMessage } from '../api/client';
import { AuthPageShell, SignInFooter } from './AuthPageShell';
import { readResetEmail, rememberResetEmail } from './pending-email';
import { requestPasswordReset } from './api';
import { INPUT_CLASS } from './field';

const ERROR_ID = 'reset-request-error';

const BUTTON_CLASS =
  'touch-target mt-3 h-9 w-full rounded-control bg-accent-strong text-sm font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2 disabled:opacity-60';

const SECONDARY_BUTTON_CLASS =
  'touch-target mt-3 h-9 w-full rounded-control border border-hairline text-sm font-medium text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2 disabled:opacity-60';

/** What a failed request shows: the message, and whether it was the address. */
interface Failure {
  message: string;
  fieldError: boolean;
}

/**
 * The Password Reset request (email/03): the page the sign-in form's "Forgot
 * password?" leads to. One field, and a promise the server keeps in the only
 * way it can — identical for every address, so this page cannot be used to
 * learn who has an account (story 10).
 *
 * The confirmation names the address and then hedges on purpose: it says what
 * was sent, never that an account was found. An unverified account receives a
 * verification link instead of a reset one (story 14), and saying so is what
 * keeps a user from staring at an inbox waiting for a message that is not
 * coming. The address is remembered for the tab (pending-email), so a refresh
 * still names the inbox instead of asking the question all over again.
 */
export function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  // Read back from this tab's session rather than kept in component state: the
  // answer that matters names an inbox, and a refresh must not turn it back into
  // a form that looks like nothing was sent.
  const [sent, setSent] = useState<string | null>(readResetEmail);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const send = async (address: string) => {
    setFailure(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(address);
      rememberResetEmail(address);
      setSent(address);
    } catch (cause) {
      setFailure({
        message: errorToUserMessage(cause),
        // Only the shape of the address is the server's to refuse; a 5xx or a
        // body we could not read is ours, and flagging the field for it would
        // point the user at the wrong thing.
        fieldError: cause instanceof ApiError && cause.status === 400,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (sent !== null) {
    return (
      <AuthPageShell>
        <h1 className="text-lg font-semibold tracking-tight">
          Check your inbox
        </h1>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          If that address has a PerfectMarkD account, we’ve sent it a link to
          choose a new password. The link works once and lasts 30 minutes.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          It went to{' '}
          <span className="font-mono font-medium text-ink">{sent}</span>. Not
          there? Check the spam folder — the subject line is “Reset your
          PerfectMarkD password”.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          If the account was never verified, the message is a verification link
          instead: open that first, then ask for a new one here.
        </p>

        <button
          type="button"
          onClick={() => void send(sent)}
          disabled={submitting}
          className={SECONDARY_BUTTON_CLASS}
        >
          {submitting ? 'Sending…' : 'Send it again'}
        </button>

        {failure && (
          <p id={ERROR_ID} role="alert" className="mt-3 text-xs text-danger">
            {failure.message}
          </p>
        )}

        <SignInFooter>Remembered it?</SignInFooter>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      <h1 className="text-lg font-semibold tracking-tight">
        Reset your password
      </h1>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Enter the address you sign in with and we’ll send you a link to choose a
        new password. It works the same whether you made your account with a
        password or with Google.
      </p>

      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void send(email.trim());
        }}
        // With JS broken this would otherwise GET, putting the address in the
        // URL and any request log. A failed POST is the safer failure.
        method="post"
        data-testid="reset-request-form"
        className="mt-5"
      >
        <label className="block text-xs font-medium text-ink-soft">
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            aria-invalid={failure?.fieldError ? true : undefined}
            aria-describedby={failure ? ERROR_ID : undefined}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={INPUT_CLASS}
          />
        </label>

        {failure && (
          <p id={ERROR_ID} role="alert" className="mt-3 text-xs text-danger">
            {failure.message}
          </p>
        )}

        <button type="submit" disabled={submitting} className={BUTTON_CLASS}>
          {submitting ? 'Sending…' : 'Send the link'}
        </button>
      </form>

      <SignInFooter>Remembered it?</SignInFooter>
    </AuthPageShell>
  );
}
