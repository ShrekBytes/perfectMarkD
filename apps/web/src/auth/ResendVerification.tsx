import { useState } from 'react';
import { errorToMessage } from '../api/client';
import { resendVerification } from './api';

const BUTTON_CLASS =
  'touch-target mt-2 h-9 w-full rounded-control border border-hairline text-sm font-medium text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2 disabled:opacity-60';

/**
 * Asks for a fresh verification link — story 5: a spam filter or a mis-delivery
 * must not lock anyone out of their account.
 *
 * With an address in hand it is one button, and no form element at all: the
 * sign-in form embeds this, and a form inside a form is invalid HTML. Without
 * one (a dead link on a device that never registered) it asks for the address
 * first, because the server's answer is success-shaped for every address and
 * would otherwise send nothing while looking like it had.
 */
export function ResendVerification({ email }: { email?: string }) {
  const [typed, setTyped] = useState('');
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const send = async () => {
    setFailure(null);
    setSent(false);
    setSubmitting(true);
    try {
      await resendVerification(email ?? typed.trim());
      setSent(true);
    } catch (cause) {
      setFailure(errorToMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  const body = (
    <>
      {email ? (
        <p className="text-[11px] leading-relaxed text-ink-faint">
          Nothing arrived? Ask for another link — each one works for 24 hours,
          and a link already in your inbox keeps working too.
        </p>
      ) : (
        <label className="block text-xs font-medium text-ink-soft">
          Your email address
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            className="touch-target mt-1 block h-9 w-full rounded-control border border-hairline bg-canvas px-2.5 text-sm text-ink outline-offset-2 outline-accent focus-visible:outline-2"
          />
        </label>
      )}

      <button
        type={email ? 'button' : 'submit'}
        onClick={email ? () => void send() : undefined}
        disabled={submitting || (!email && typed.trim() === '')}
        className={BUTTON_CLASS}
      >
        {submitting ? 'Sending…' : 'Send a new link'}
      </button>

      {sent && (
        <p role="status" className="mt-2 text-[11px] text-ink">
          Sent. If it still doesn’t arrive, check the spam folder — the subject
          line is “Verify your PerfectMarkD email address”.
        </p>
      )}

      {failure && (
        <p role="alert" className="mt-2 text-[11px] text-danger">
          {failure}
        </p>
      )}
    </>
  );

  return email ? (
    <div className="mt-5">{body}</div>
  ) : (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
      className="mt-5"
    >
      {body}
    </form>
  );
}
