import { useState } from 'react';
import { errorToMessage } from '../api/client';
import { Dialog } from '../shell/Dialog';
import { DialogActions } from '../shell/DialogActions';
import { changeUserEmail, type AdminUserDetail } from './api';

interface ChangeEmailDialogProps {
  user: AdminUserDetail;
  /** Called once the link is on its way; the panel refreshes underneath. */
  onDone: () => void;
  onClose: () => void;
}

/**
 * Moving an account off a dead mailbox (email/05): the Admin's escape hatch, and
 * the only email change with no current password behind it — the Admin is the
 * operator, and the user in front of them cannot produce one.
 *
 * The mechanics are the Account page's (email/04) on purpose: the link goes to
 * the new address and the account follows it, so a mistyped address costs a
 * second request rather than the account.
 */
export function ChangeEmailDialog({
  user,
  onDone,
  onClose,
}: ChangeEmailDialogProps) {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (submitting || email.trim() === '') return;
    setError(null);
    setSubmitting(true);
    try {
      // The server normalizes the address it will mail, so the confirmation
      // names what it stored rather than what was typed.
      setSentTo(await changeUserEmail(user.id, email));
      onDone();
    } catch (cause) {
      setError(errorToMessage(cause));
      setSubmitting(false);
    }
  };

  if (sentTo !== null) {
    return (
      <Dialog
        label="Email change sent"
        testId="change-email-sent-dialog"
        backdropTestId="change-email-sent-backdrop"
        panelClassName="w-full max-w-sm"
        onClose={onClose}
      >
        <p
          role="status"
          data-testid="change-email-sent"
          className="text-xs leading-relaxed text-ink-soft"
        >
          A link is on its way to{' '}
          <span className="font-mono font-medium text-ink">{sentTo}</span>. The
          login email changes when whoever owns that inbox opens it — until then
          it is still{' '}
          <span className="font-mono font-medium text-ink">{user.email}</span>,
          and the password does not change either way.
        </p>
        <button
          type="button"
          data-testid="change-email-done"
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
      label="Change login email"
      testId="change-email-dialog"
      backdropTestId="change-email-backdrop"
      panelClassName="w-full max-w-sm"
      onClose={onClose}
    >
      <p className="text-xs text-ink-soft">Login email</p>
      <p
        data-testid="change-email-current"
        className="mt-0.5 font-mono text-xs text-ink"
      >
        {user.email}
      </p>
      <label className="mt-3 block text-xs font-medium text-ink-soft">
        New email address
        <input
          type="email"
          data-testid="change-email-input"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="new@example.com"
          className="mt-1 block h-9 w-full rounded-control border border-hairline bg-canvas px-2.5 text-sm text-ink outline-offset-2 outline-accent focus-visible:outline-2"
        />
      </label>
      <p className="mt-2 text-[11px] text-ink-faint">
        The link goes to the new address, not to this one, and nothing changes
        until it is opened — so ask the user to watch that inbox.
      </p>

      <DialogActions
        error={error}
        confirmLabel="Send the link"
        busyLabel="Sending…"
        submitting={submitting}
        disabled={email.trim() === ''}
        confirmTestId="confirm-change-email"
        onConfirm={() => void onSubmit()}
        onCancel={onClose}
      />
    </Dialog>
  );
}
