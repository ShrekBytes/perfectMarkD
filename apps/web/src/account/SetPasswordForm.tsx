import { useState, type FormEvent } from 'react';
import { errorToFormFailure, type FormFailure } from '../api/client';
import { useAccountStore } from '../auth/account-store';
import { INPUT_CLASS, PASSWORD_MIN, passwordHint } from '../auth/field';
import { AccountSection } from './AccountSection';

/** The form is rendered once per page, so the IDs are stable and unique. */
const HINT_ID = 'account-set-password-hint';
const ERROR_ID = 'account-set-password-error';

export interface SetPasswordFormProps {
  /**
   * Called once the password is set. The form goes away with it — the account
   * now has a password, so the page swaps in Change Password — and the caller
   * is what confirms the change.
   */
  onSet: () => void;
}

/**
 * The Account page's Set Password section (google-signin/01b): two fields — new,
 * confirm — for an account that has no password of its own. Change Password
 * asks for the current password, which an account that registered with Google
 * cannot answer, so this is the only way one gets a password while signed in.
 *
 * Deliberately the shape of ChangePasswordForm with the current-password field
 * and its client-side check left out — the same policy, the same minimum, the
 * same inline failure, read here as the one question a passwordless account
 * cannot answer. The wording names no sign-in method: this section is for every
 * account without a password, whatever it signed in with.
 *
 * The session is the whole check, so nothing about the existing sign-in method
 * is sent.
 */
export function SetPasswordForm({ onSet }: SetPasswordFormProps) {
  const setPassword = useAccountStore((state) => state.setPassword);
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [failure, setFailure] = useState<FormFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);

    // Client-side first: a too-short or mismatched password is the user's
    // input — correct it before a round trip.
    if (next.length < PASSWORD_MIN) {
      setFailure({
        message: `New password must be at least ${PASSWORD_MIN} characters.`,
        fieldError: true,
      });
      return;
    }
    if (confirm !== next) {
      setFailure({ message: 'The passwords don’t match.', fieldError: true });
      return;
    }

    setSubmitting(true);
    try {
      await setPassword(next);
      onSet();
    } catch (cause) {
      // A 400 is the policy; a 409 is an account that already has a password,
      // which is a Change Password after all — the page swaps in on the next
      // /api/me, so the message names that rather than the server's.
      setFailure(errorToFormFailure(cause, [400, 409]));
    } finally {
      setSubmitting(false);
    }
  };

  const hint = passwordHint(next.length);

  const fieldInvalid = failure?.fieldError ? true : undefined;
  const nextDescribedBy =
    [hint ? HINT_ID : null, failure ? ERROR_ID : null]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <AccountSection
      headingId="account-set-password-heading"
      heading="Set password"
    >
      <p className="mt-1 max-w-prose text-xs leading-relaxed text-ink-soft">
        Optional. This account has no password of its own — set one and you can
        sign in with a password as well as the way you signed in here. If you
        ever lose that one, the password reset on the sign-in page is the way
        back.
      </p>

      <form
        onSubmit={(event) => void onSubmit(event)}
        // With JS broken this would otherwise GET, putting the password in the
        // URL and any request log. A failed POST is the safer failure.
        method="post"
        data-testid="set-password-form"
        className="mt-3 w-full"
      >
        <label className="block text-xs font-medium text-ink-soft">
          New password
          <input
            type="password"
            name="newPassword"
            autoComplete="new-password"
            required
            aria-invalid={fieldInvalid}
            aria-describedby={nextDescribedBy}
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
            aria-invalid={fieldInvalid}
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

        <button
          type="submit"
          disabled={submitting}
          className="touch-target mt-4 h-9 w-full rounded-control bg-accent-strong text-sm font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2 disabled:opacity-60"
        >
          {submitting ? 'Setting…' : 'Set password'}
        </button>
      </form>
    </AccountSection>
  );
}
