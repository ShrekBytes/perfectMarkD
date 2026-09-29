import { useState } from 'react';
import { errorToMessage } from '../api/client';
import { Dialog } from '../shell/Dialog';
import { DialogActions } from '../shell/DialogActions';
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
      setError(errorToMessage(cause));
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

      <DialogActions
        error={error}
        confirmLabel="Delete permanently"
        busyLabel="Deleting…"
        submitting={submitting}
        disabled={!confirmed}
        tone="danger-ghost"
        confirmTestId="confirm-delete"
        onConfirm={() => void onDelete()}
        onCancel={onClose}
      />
    </Dialog>
  );
}
