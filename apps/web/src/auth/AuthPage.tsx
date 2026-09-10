import { useState, type FormEvent } from 'react';
import { Link, navigate } from '../router';
import { useTheme } from '../theme/theme';
import { ThemeToggle } from '../theme/ThemeToggle';
import { login, register } from './api';

interface AuthPageProps {
  mode: 'login' | 'register';
}

const COPY = {
  login: {
    heading: 'Sign in',
    blurb: 'Sign in to manage a paid plan and Server Export.',
    submit: 'Sign in',
    switchText: 'New here?',
    switchLabel: 'Create one',
    switchTo: '/register',
    autoComplete: 'current-password',
  },
  register: {
    heading: 'Create account',
    blurb: 'Free to use. No email verification — keep your password safe.',
    submit: 'Create account',
    switchText: 'Already have an account?',
    switchLabel: 'Sign in',
    switchTo: '/login',
    autoComplete: 'new-password',
  },
} as const;

/**
 * Minimal email + password form for the two auth routes. Free users never see
 * this except through the upgrade flow (billing/01); it exists so accounts can
 * be created and sessions managed before the full upgrade UI lands. On success
 * it returns to the editor, where the session cookie now applies.
 */
export function AuthPage({ mode }: AuthPageProps) {
  const { theme, toggle } = useTheme();
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
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password);
      }
      navigate('/');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col bg-canvas text-ink">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline bg-surface px-3">
        <Link
          to="/"
          aria-label="PerfectMarkD home"
          className="select-none px-1 text-[15px] font-semibold tracking-tight"
        >
          Perfect<span className="text-accent">Mark</span>D
        </Link>
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle theme={theme} onToggle={toggle} />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        <form
          onSubmit={(event) => void onSubmit(event)}
          className="w-full max-w-sm rounded-pane border border-hairline bg-surface p-6 shadow-sm"
        >
          <h1 className="text-lg font-semibold tracking-tight">
            {copy.heading}
          </h1>
          <p className="mt-1 text-xs text-ink-soft">{copy.blurb}</p>

          <label className="mt-5 block text-xs font-medium text-ink-soft">
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
            <Link
              to={copy.switchTo}
              className="font-medium text-accent outline-offset-2 outline-accent hover:underline focus-visible:outline-2"
            >
              {copy.switchLabel}
            </Link>
          </p>
        </form>
      </main>
    </div>
  );
}
