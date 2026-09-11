import { useState } from 'react';
import { Dialog } from '../shell/Dialog';
import { CopyButton } from '../billing/CopyButton';
import { resetUserPassword, type AdminUserDetail } from './api';

interface ResetPasswordDialogProps {
  user: AdminUserDetail;
  /** Called after the reset landed; the dialog closes and the panel refreshes. */
  onDone: () => void;
  onClose: () => void;
}

/**
 * Manual password reset (billing/03): no email infrastructure exists, so the
 * server generates a temporary password, every session is revoked, and the
 * password is shown here exactly once — the Admin hands it over out-of-band.
 */
export function ResetPasswordDialog({
  user,
  onDone,
  onClose,
}: ResetPasswordDialogProps) {
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onReset = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      setTemporaryPassword(await resetUserPassword(user.id));
      onDone();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
      );
      setSubmitting(false);
    }
  };

  if (temporaryPassword !== null) {
    return (
      <Dialog
        label="Temporary password"
        testId="temp-password-dialog"
        backdropTestId="temp-password-backdrop"
        panelClassName="w-full max-w-sm"
        onClose={onClose}
      >
        <p className="text-xs text-ink-soft">
          Hand this to {user.email} over a channel you trust. It is shown only
          once — the server stores only its hash.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <code
            data-testid="temp-password"
            className="flex-1 break-all rounded-control border border-hairline bg-canvas px-2.5 py-2 font-mono text-sm text-ink"
          >
            {temporaryPassword}
          </code>
          <CopyButton
            value={temporaryPassword}
            label="Copy temporary password"
          />
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          All of the user&apos;s previous sessions were signed out.
        </p>
        <button
          type="button"
          data-testid="temp-password-done"
          onClick={onClose}
          autoFocus
          className="mt-4 h-9 w-full rounded-control bg-accent text-sm font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-strong focus-visible:outline-2"
        >
          Done
        </button>
      </Dialog>
    );
  }

  return (
    <Dialog
      label="Reset password"
      testId="reset-password-dialog"
      backdropTestId="reset-password-backdrop"
      panelClassName="w-full max-w-sm"
      onClose={onClose}
    >
      <p className="text-xs text-ink-soft">{user.email}</p>
      <p className="mt-2 text-xs text-ink">
        A temporary password is generated and every session is signed out. No
        email is sent — hand the password to the user yourself.
      </p>

      {error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          data-testid="confirm-reset"
          disabled={submitting}
          onClick={() => void onReset()}
          className="h-9 flex-1 rounded-control bg-accent text-sm font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-strong focus-visible:outline-2 disabled:opacity-60"
        >
          {submitting ? 'Generating…' : 'Generate temp password'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-control border border-hairline px-3 text-sm text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
        >
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
