import { Link, navigate } from '../router';
import { useTheme } from '../theme/theme';
import { ThemeToggle } from '../theme/ThemeToggle';
import { AuthForm, type AuthMode } from './AuthForm';
import { useAccountStore } from './account-store';

interface AuthPageProps {
  mode: AuthMode;
}

const COPY = {
  login: {
    heading: 'Sign in',
    blurb: 'Sign in to manage a paid plan and Server Export.',
  },
  register: {
    heading: 'Create account',
    blurb: 'Free to use. No email verification — keep your password safe.',
  },
} as const;

/**
 * The standalone /login and /register pages. Free users only meet these via
 * the upgrade flow's in-dialog account step (billing/01); this page exists so
 * accounts can be reached directly and sessions managed. On success it
 * returns to the editor, where the session cookie now applies.
 */
export function AuthPage({ mode }: AuthPageProps) {
  const { theme, toggle } = useTheme();
  const copy = COPY[mode];
  const signedIn = useAccountStore((state) => state.signedIn);

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
        <div className="w-full max-w-sm rounded-pane border border-hairline bg-surface p-6 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">
            {copy.heading}
          </h1>
          <p className="mt-1 text-xs text-ink-soft">{copy.blurb}</p>

          <div className="mt-5">
            <AuthForm
              mode={mode}
              onAuthenticated={(user) => {
                signedIn(user);
                navigate('/');
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
