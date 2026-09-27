import { useState } from 'react';
import { Dialog } from '../shell/Dialog';
import {
  sendUserResetLink,
  type AdminUserDetail,
  type SentResetLink,
} from './api';

interface SendResetLinkDialogProps {
  user: AdminUserDetail;
  /** Called once the link is on its way; the panel refreshes underneath. */
  onDone: () => void;
  onClose: () => void;
}

/**
 * The window the server reported, in the units a person reads: the panel states
 * the number it was given rather than a copy of the server's own that can fall
 * behind it.
 */
function windowIn(minutes: number): string {
  return minutes >= 120
    ? `${Math.round(minutes / 60)} hours`
    : `${minutes} minutes`;
}

/**
 * Sending a password-reset link (email/05): the Admin's recovery action, and the
 * reason the temporary password is gone. The user chooses their own password
 * from the link, so the panel never holds one, and nothing about the account
 * changes until they do.
 */
export function SendResetLinkDialog({
  user,
  onDone,
  onClose,
}: SendResetLinkDialogProps) {
  const [sent, setSent] = useState<SentResetLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSend = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      setSent(await sendUserResetLink(user.id));
      onDone();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
      );
      setSubmitting(false);
    }
  };

  if (sent !== null) {
    return (
      <Dialog
        label="Reset link sent"
        testId="reset-link-sent-dialog"
        backdropTestId="reset-link-sent-backdrop"
        panelClassName="w-full max-w-sm"
        onClose={onClose}
      >
        <p
          role="status"
          data-testid="reset-link-sent"
          className="text-xs leading-relaxed text-ink-soft"
        >
          {sent.kind === 'verification' ? (
            <>
              This account’s email was never verified, so a verification link
              went to{' '}
              <span className="font-mono font-medium text-ink">
                {user.email}
              </span>{' '}
              instead — sign-in stays locked until that one is followed, so it
              is the link that gets them in. It works once and lasts{' '}
              {windowIn(sent.expiresInMinutes)}.
            </>
          ) : (
            <>
              A reset link is on its way to{' '}
              <span className="font-mono font-medium text-ink">
                {user.email}
              </span>
              . It works once and expires in {windowIn(sent.expiresInMinutes)}.
              Ask them to check that inbox: choosing a new password from the
              link is what signs every one of their devices out.
            </>
          )}
        </p>
        <button
          type="button"
          data-testid="reset-link-done"
          onClick={onClose}
          autoFocus
          className="mt-4 h-9 w-full rounded-control bg-accent-strong text-sm font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2"
        >
          Done
        </button>
      </Dialog>
    );
  }

  return (
    <Dialog
      label="Send reset link"
      testId="send-reset-link-dialog"
      backdropTestId="send-reset-link-backdrop"
      panelClassName="w-full max-w-sm"
      onClose={onClose}
    >
      <p className="text-xs text-ink-soft">{user.email}</p>
      <p className="mt-2 text-xs text-ink">
        A one-time link goes to that address and the user chooses their own
        password from it. No password is shown here, and nothing changes until
        they follow the link.
      </p>

      {error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          data-testid="confirm-send-reset-link"
          disabled={submitting}
          onClick={() => void onSend()}
          className="h-9 flex-1 rounded-control bg-accent-strong text-sm font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2 disabled:opacity-60"
        >
          {submitting ? 'Sending…' : 'Send reset link'}
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
