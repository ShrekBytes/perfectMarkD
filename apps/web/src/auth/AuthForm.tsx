import { useEffect, useState, type FormEvent } from 'react';
import { FALLBACK_CODE } from '../api/client';
import { Link } from '../router';
import { AuthError, login, register, type AuthUser } from './api';

export type AuthMode = 'login' | 'register';

/** The policy the server enforces on new passwords (server/02). */
const PASSWORD_MIN = 8;

/** Shared by the password helper and the form-level error. A page renders one
 *  AuthForm at a time, so the IDs are stable and unique in the document. */
const PASSWORD_HINT_ID = 'auth-password-hint';
const ERROR_ID = 'auth-error';
const RECOVERY_ID = 'auth-recovery';

const COPY = {
  login: {
    submit: 'Sign in',
    switchText: 'New here?',
    switchLabel: 'Create an account',
    switchTo: '/register',
    autoComplete: 'current-password',
  },
  register: {
    submit: 'Create account',
    switchText: 'Already have an account?',
    switchLabel: 'Sign in',
    switchTo: '/login',
    autoComplete: 'new-password',
  },
} as const;

/** The mode switch is a full-width ghost target, not a 15px text link inside a
 *  sentence: it is the route to registration, and DESIGN.md's 44 Rule names the
 *  auth fields explicitly (coarse pointers floor it at 44px). */
const SWITCH_CLASS =
  'touch-target mt-2 flex h-9 w-full items-center justify-center rounded-control border border-hairline text-sm font-medium text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2';

/** Statuses where the recovery is to fix what was typed, so the inputs are
 *  marked invalid. A 5xx, an unreadable body, or a fetch that never landed is
 *  not the user's input; flagging a field there would misdirect them. */
function isFieldError(status: number | undefined): boolean {
  return status === 400 || status === 401 || status === 409 || status === 422;
}

/** Name the problem and the recovery (DESIGN.md → Do's). The server's own
 *  message wins when it carries one; the generic strings are ours. A 5xx or
 *  the fallback marker (a body the client couldn't read) is never about the
 *  input, so the status is dropped and no field is flagged. */
function messageFor(cause: unknown): { message: string; status?: number } {
  if (cause instanceof AuthError) {
    if (cause.status >= 500 || cause.code === FALLBACK_CODE) {
      return {
        message: "The server couldn't complete that. Try again in a moment.",
      };
    }
    return { message: cause.message, status: cause.status };
  }
  // fetch rejects with a TypeError when the request never reaches the API —
  // the API process is down, or the device is offline.
  return {
    message: "Couldn't reach the server. Check your connection and try again.",
  };
}

/** The honest recovery for a product with no email infrastructure: no
 *  self-serve reset, but the Admin can set a temporary password (billing/03). */
const RECOVERY_COPY =
  'No automatic resets. Ask the Admin to set a temporary password, then sign in with it here.';

export interface AuthFormProps {
  mode: AuthMode;
  /** Called after a successful login/register — the session cookie is set. */
  onAuthenticated: (user: AuthUser) => void;
  /**
   * Switches the form to the other mode in place (the upgrade dialog flips a
   * local state); when omitted the footer falls back to navigating between
   * /login and /register like the standalone page.
   */
  onSwitchMode?: () => void;
}

/**
 * The email + password form shared by the standalone auth page and the
 * upgrade flow's account step (billing/01). Owns its fields, errors, and the
 * mode-switch footer; callers decide what "success" means.
 */
export function AuthForm({
  mode,
  onAuthenticated,
  onSwitchMode,
}: AuthFormProps) {
  const copy = COPY[mode];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [failure, setFailure] = useState<{
    message: string;
    status?: number;
  } | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // A failure or an open recovery panel on one form must not follow the user
  // to the other. Email and password are kept — it is the same account either
  // way, and the register hint states the password policy as the user types,
  // so a carried password announces the contract it now sits under.
  useEffect(() => {
    setFailure(null);
    setRecoveryOpen(false);
  }, [mode]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    setSubmitting(true);
    try {
      const user =
        mode === 'login'
          ? await login(email, password)
          : await register(email, password);
      onAuthenticated(user);
    } catch (cause) {
      setFailure(messageFor(cause));
      setSubmitting(false);
    }
  };

  const short = password.length > 0 && password.length < PASSWORD_MIN;
  const hint =
    mode === 'register'
      ? short
        ? `At least ${PASSWORD_MIN} characters — ${PASSWORD_MIN - password.length} more needed.`
        : `At least ${PASSWORD_MIN} characters.`
      : null;

  const fieldInvalid =
    failure !== null && isFieldError(failure.status) ? true : undefined;
  const passwordDescribedBy =
    [hint ? PASSWORD_HINT_ID : null, failure ? ERROR_ID : null]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      // With JS broken this would otherwise GET, putting the password in the
      // URL and any request log. A failed POST is the safer failure.
      method="post"
      data-testid="auth-form"
      className="w-full"
    >
      <label className="block text-xs font-medium text-ink-soft">
        Email
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          aria-invalid={fieldInvalid}
          aria-describedby={failure ? ERROR_ID : undefined}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="touch-target mt-1 block h-9 w-full rounded-control border border-hairline bg-canvas px-2.5 text-sm text-ink outline-offset-2 outline-accent focus-visible:outline-2"
        />
      </label>

      <label className="mt-3 block text-xs font-medium text-ink-soft">
        Password
        <input
          type="password"
          name="password"
          autoComplete={copy.autoComplete}
          required
          aria-invalid={fieldInvalid}
          aria-describedby={passwordDescribedBy}
          // The 8-char policy applies to new passwords; login accepts
          // whatever the account already has (e.g. an admin temp reset).
          minLength={mode === 'register' ? PASSWORD_MIN : undefined}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="touch-target mt-1 block h-9 w-full rounded-control border border-hairline bg-canvas px-2.5 text-sm text-ink outline-offset-2 outline-accent focus-visible:outline-2"
        />
      </label>

      {hint && (
        <p
          id={PASSWORD_HINT_ID}
          role="status"
          className="mt-1 text-[11px] text-ink-faint"
        >
          {hint}
        </p>
      )}

      {failure && (
        <p id={ERROR_ID} role="alert" className="mt-3 text-xs text-danger">
          {failure.message}
        </p>
      )}

      {mode === 'login' && (
        <>
          <button
            type="button"
            onClick={() => setRecoveryOpen((open) => !open)}
            aria-expanded={recoveryOpen}
            aria-controls={RECOVERY_ID}
            className="touch-target mt-2 flex w-fit items-center rounded-control px-1 text-xs text-ink-soft outline-offset-2 outline-accent hover:text-ink focus-visible:outline-2"
          >
            Forgot password?
          </button>
          {recoveryOpen && (
            <p
              id={RECOVERY_ID}
              className="mt-1 text-[11px] leading-relaxed text-ink-faint"
            >
              {RECOVERY_COPY}
            </p>
          )}
        </>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="touch-target mt-5 h-9 w-full rounded-control bg-accent-strong text-sm font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-deep focus-visible:outline-2 disabled:opacity-60"
      >
        {submitting ? 'Please wait…' : copy.submit}
      </button>

      <p className="mt-4 text-center text-xs text-ink-soft">
        {copy.switchText}
      </p>
      {onSwitchMode ? (
        <button type="button" onClick={onSwitchMode} className={SWITCH_CLASS}>
          {copy.switchLabel}
        </button>
      ) : (
        <Link to={copy.switchTo} className={SWITCH_CLASS}>
          {copy.switchLabel}
        </Link>
      )}
    </form>
  );
}
