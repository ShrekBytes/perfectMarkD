import { useState } from 'react';
import { Dialog } from '../shell/Dialog';
import { deleteAdminUser, type AdminUserDetail } from './api';

interface DeleteAccountDialogProps {
  user: AdminUserDetail;
  /** Called after the deletion landed; the panel returns to the list. */
  onDeleted: () => void;
  onClose: () => void;
}

/**
 * Account deletion (billing/03): destructive and unrecoverable, so the Admin
 * types the account's email to confirm. The account and its personal data are
 * removed; Orders remain as anonymized financial records.
 */
export function DeleteAccountDialog({
  user,
  onDeleted,
  onClose,
}: DeleteAccountDialogProps) {
  const [confirmEmail, setConfirmEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const confirmed = confirmEmail.trim().toLowerCase() === user.email;

  const onDelete = async () => {
    if (submitting || !confirmed) return;
    setError(null);
    setSubmitting(true);
    try {
      await deleteAdminUser(user.id);
      onDeleted();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
      );
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      label="Delete account"
      testId="delete-dialog"
      backdropTestId="delete-backdrop"
      panelClassName="w-full max-w-sm"
      onClose={onClose}
    >
      <p className="text-xs text-ink-soft">{user.email}</p>
      <p className="mt-2 text-xs text-ink">
        This removes the account, its sessions, entitlement, quota usage, and
        Export History. Orders remain as anonymized records. This cannot be
        undone.
      </p>
      <label className="mt-3 block text-xs font-medium text-ink-soft">
        Type the account&apos;s email to confirm
        <input
          type="text"
          data-testid="delete-confirm-email"
          value={confirmEmail}
          onChange={(event) => setConfirmEmail(event.target.value)}
          placeholder={user.email}
          className="mt-1 block h-9 w-full rounded-control border border-hairline bg-canvas px-2.5 text-sm text-ink outline-offset-2 outline-accent focus-visible:outline-2"
        />
      </label>

      {error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          data-testid="confirm-delete"
          disabled={!confirmed || submitting}
          onClick={() => void onDelete()}
          className="h-9 flex-1 rounded-control border border-danger/30 text-sm font-medium text-danger transition-colors duration-150 outline-offset-2 outline-accent hover:bg-danger/10 focus-visible:outline-2 disabled:opacity-60"
        >
          {submitting ? 'Deleting…' : 'Delete permanently'}
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
