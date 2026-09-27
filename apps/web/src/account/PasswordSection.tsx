import { useState } from 'react';
import { useSignInMethods } from '../auth/account-store';
import type { SignInMethods } from '../auth/api';
import { ChangePasswordForm } from './ChangePasswordForm';
import { SetPasswordForm } from './SetPasswordForm';

/** How this account signs in, in one line (CONTEXT.md → Sign-in method). An
 *  account may have either or both, and the server says which. */
function methodLine(signIn: SignInMethods): string {
  if (signIn.password && signIn.google) {
    return 'Password and Google — either one signs you in.';
  }
  if (signIn.password) return 'Password — the one you set here.';
  if (signIn.google) {
    return 'Google — this account has no password of its own yet.';
  }
  return 'No sign-in method is set up on this account yet.';
}

/**
 * The Account page's password section (google-signin/01b): the line naming how
 * this account signs in, and the form that matches it. An account with a
 * password of its own gets Change Password; one that registered with Google has
 * none, and gets Set Password — the section that gives it its first one. Both
 * read the `signIn` block /api/me reports, so the page renders what the server
 * says and never guesses which of the two an account has.
 *
 * The line is a caption above the form's pane rather than a pane of its own, so
 * the page keeps one border per section.
 */
export function PasswordSection() {
  const signIn = useSignInMethods();
  // The one confirmation Set Password needs: the form is gone the moment the
  // account has a password, so the page that composed it says so.
  const [justSet, setJustSet] = useState(false);

  return (
    <>
      {signIn && (
        <p
          data-testid="account-signin-methods"
          // Aligned to the pane's own text column, so the caption reads as
          // belonging to the section below it.
          className="px-4 text-xs leading-relaxed text-ink-soft sm:px-5"
        >
          {methodLine(signIn)}
        </p>
      )}

      {justSet && (
        <p
          role="status"
          data-testid="set-password-success"
          className="px-4 text-xs leading-relaxed text-ink sm:px-5"
        >
          Your password is set — other signed-in devices were signed out. You
          can sign in with it from now on.
        </p>
      )}

      {signIn !== null && !signIn.password ? (
        <SetPasswordForm onSet={() => setJustSet(true)} />
      ) : (
        // Changing the password reports the same outcome, so this form's own
        // confirmation takes over from the one above rather than stacking on it.
        <ChangePasswordForm onChanged={() => setJustSet(false)} />
      )}
    </>
  );
}
