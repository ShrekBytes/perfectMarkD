import { useState, type FormEvent } from 'react';
import { errorToFormFailure, type FormFailure } from '../api/client';
import { changePassword } from '../auth/api';
import { INPUT_CLASS, PASSWORD_MIN, passwordHint } from '../auth/field';
import { AccountSection } from './AccountSection';

/** The form is rendered once per page, so the IDs are stable and unique. */
const HINT_ID = 'account-password-hint';
const ERROR_ID = 'account-password-error';

export interface ChangePasswordFormProps {
  /**
   * Called after a successful change. The page that composes this uses it to
   * stand down any confirmation of its own (google-signin/01b's Set Password
   * hands over to this form, and both report the same outcome).
   */
  onChanged?: () => void;
}

/**
 * The Account page's inline change-password section: three fields — current,
 * new, confirm — calling the existing change-password client function. The
 * 8-character minimum matches the register policy and is checked before the
 * request, so a too-short password gets inline feedback instead of a round
 * trip. Success and failure render inline; the current session stays valid
 * after a change (the server signs out other devices only).
 */
export function ChangePasswordForm({
  onChanged,
}: ChangePasswordFormProps = {}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [failure, setFailure] = useState<FormFailure | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    setSuccess(false);

    // Client-side first: a too-short or mismatched new password is the
    // user's input — correct it before a round trip.
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
      await changePassword(current, next);
      setSuccess(true);
      setCurrent('');
      setNext('');
      setConfirm('');
      onChanged?.();
    } catch (cause) {
      // A 400 is the policy, a 401 the current password: both are the input.
      setFailure(errorToFormFailure(cause, [400, 401]));
    } finally {
      setSubmitting(false);
    }
  };

  const hint = passwordHint(next.length);

  const fieldInvalid =
    failure !== null && failure.fieldError ? true : undefined;
  const nextDescribedBy =
    [hint ? HINT_ID : null, failure ? ERROR_ID : null]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <AccountSection
      headingId="account-password-heading"
      heading="Change password"
    >
      <form
        onSubmit={(event) => void onSubmit(event)}
        // With JS broken this would otherwise GET, putting the password in the
        // URL and any request log. A failed POST is the safer failure.
        method="post"
        data-testid="change-password-form"
        className="mt-3 w-full"
      >
        <label className="block text-xs font-medium text-ink-soft">
          Current password
          <input
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            required
            aria-invalid={fieldInvalid}
            aria-describedby={failure ? ERROR_ID : undefined}
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            className={INPUT_CLASS}
          />
        </label>

        <label className="mt-3 block text-xs font-medium text-ink-soft">
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

        {success && (
          <p
            role="status"
            data-testid="change-password-success"
            className="mt-3 text-xs text-ink"
          >
            Your password has been changed. Other signed-in devices were signed
            out.
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="touch-target mt-4 h-9 w-full rounded-control bg-accent-strong text-sm font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2 disabled:opacity-60"
        >
          {submitting ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </AccountSection>
  );
}
