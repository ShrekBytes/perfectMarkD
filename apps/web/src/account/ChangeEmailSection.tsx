import { useState, type FormEvent } from 'react';
import { errorToFormFailure, type FormFailure } from '../api/client';
import { useAccountStore } from '../auth/account-store';
import { requestEmailChange } from '../auth/api';
import { INPUT_CLASS } from '../auth/field';
import { AccountSection } from './AccountSection';

/** The form is rendered once per page, so the IDs are stable and unique. */
const ERROR_ID = 'account-email-error';

/**
 * The Account page's login-email section: the address in use, and the form that
 * moves it (email/04).
 *
 * Nothing here changes the address. The current password goes to the server,
 * which mails a one-time link to the new address, and the account moves only
 * when the owner of that address opens it — so the confirmation names the inbox
 * to watch and says plainly that the address in use is still the one in use.
 */
export function ChangeEmailSection() {
  const user = useAccountStore((state) => state.user);
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [failure, setFailure] = useState<FormFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The Account page gates its sections on the session, and this one has no
  // meaning without an address to change.
  if (!user) return null;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);

    setSubmitting(true);
    try {
      // The server stores the address it will mail, and normalizes it; the
      // confirmation names what it stored, so the user watches the right inbox.
      setSentTo(await requestEmailChange(email, currentPassword));
      setCurrentPassword('');
    } catch (cause) {
      setFailure(errorToFormFailure(cause, [400, 401]));
    } finally {
      setSubmitting(false);
    }
  };

  const fieldInvalid = failure?.fieldError ? true : undefined;

  return (
    <AccountSection headingId="account-email-heading" heading="Login email">
      <p
        data-testid="change-email-current"
        className="mt-1 font-mono text-xs text-ink-soft"
      >
        {user.email}
      </p>

      {sentTo === null ? (
        <form
          onSubmit={(event) => void onSubmit(event)}
          // With JS broken this would otherwise GET, putting the password in the
          // URL and any request log. A failed POST is the safer failure.
          method="post"
          data-testid="change-email-form"
          className="mt-3 w-full"
        >
          <label className="block text-xs font-medium text-ink-soft">
            New email address
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              aria-invalid={fieldInvalid}
              aria-describedby={failure ? ERROR_ID : undefined}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={INPUT_CLASS}
            />
          </label>

          <label className="mt-3 block text-xs font-medium text-ink-soft">
            Current password
            <input
              type="password"
              name="currentPassword"
              autoComplete="current-password"
              required
              aria-invalid={fieldInvalid}
              aria-describedby={failure ? ERROR_ID : undefined}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className={INPUT_CLASS}
            />
          </label>

          <p className="mt-2 text-[11px] text-ink-faint">
            We’ll send the link to the new address, not to this one. Your
            password does not change.
          </p>

          {failure && (
            <p id={ERROR_ID} role="alert" className="mt-3 text-xs text-danger">
              {failure.message}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="touch-target mt-4 h-9 w-full rounded-control bg-accent-strong text-sm font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2 disabled:opacity-60"
          >
            {submitting ? 'Sending…' : 'Send the link'}
          </button>
        </form>
      ) : (
        <>
          <p
            role="status"
            data-testid="change-email-sent"
            className="mt-3 text-xs leading-relaxed text-ink-soft"
          >
            Open the link we sent to{' '}
            <span className="font-mono font-medium text-ink">{sentTo}</span>.
            Your login email changes when you do — until then it is still the
            one above, and your password stays the same.
          </p>
          <button
            type="button"
            onClick={() => {
              setSentTo(null);
              setFailure(null);
            }}
            className="touch-target mt-4 h-9 w-full rounded-control border border-hairline text-sm font-medium text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
          >
            Use a different address
          </button>
        </>
      )}
    </AccountSection>
  );
}
