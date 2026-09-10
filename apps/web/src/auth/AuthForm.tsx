import { useState, type FormEvent } from 'react';
import { Link } from '../router';
import { login, register, type AuthUser } from './api';

export type AuthMode = 'login' | 'register';

const COPY = {
  login: {
    submit: 'Sign in',
    switchText: 'New here?',
    switchLabel: 'Create one',
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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user =
        mode === 'login'
          ? await login(email, password)
          : await register(email, password);
      onAuthenticated(user);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
      );
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
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
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 block h-9 w-full rounded-control border border-hairline bg-canvas px-2.5 text-sm text-ink outline-offset-2 outline-accent focus-visible:outline-2"
        />
      </label>

      <label className="mt-3 block text-xs font-medium text-ink-soft">
        Password
        <input
          type="password"
          name="password"
          autoComplete={copy.autoComplete}
          required
          // The 8-char policy applies to new passwords; login accepts
          // whatever the account already has (e.g. an admin temp reset).
          minLength={mode === 'register' ? 8 : undefined}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 block h-9 w-full rounded-control border border-hairline bg-canvas px-2.5 text-sm text-ink outline-offset-2 outline-accent focus-visible:outline-2"
        />
      </label>

      {error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-5 h-9 w-full rounded-control bg-accent text-sm font-medium text-accent-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-accent-strong focus-visible:outline-2 disabled:opacity-60"
      >
        {submitting ? 'Please wait…' : copy.submit}
      </button>

      <p className="mt-4 text-center text-xs text-ink-soft">
        {copy.switchText}{' '}
        {onSwitchMode ? (
          <button
            type="button"
            onClick={onSwitchMode}
            className="font-medium text-accent outline-offset-2 outline-accent hover:underline focus-visible:outline-2"
          >
            {copy.switchLabel}
          </button>
        ) : (
          <Link
            to={copy.switchTo}
            className="font-medium text-accent outline-offset-2 outline-accent hover:underline focus-visible:outline-2"
          >
            {copy.switchLabel}
          </Link>
        )}
      </p>
    </form>
  );
}
