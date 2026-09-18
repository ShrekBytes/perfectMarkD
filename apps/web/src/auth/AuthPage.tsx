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
    // No colophon: the login form's "Forgot password?" affordance carries the
    // recovery answer.
    colophon: undefined,
  },
  register: {
    heading: 'Create account',
    blurb: 'An account lets you take a paid plan — with Export History.',
    // The honest warning with the honest recovery, no blame: the Admin can
    // set a temporary password (billing/03), and the login form's "Forgot
    // password?" affordance carries the full answer.
    colophon:
      'No email verification and no password reset — if you are locked out, ask the Admin.',
  },
} as const;

/**
 * The standalone /login and /register pages. Free users only meet these via
 * the upgrade flow's in-dialog account step (billing/01); this page exists so
 * accounts can be reached directly and sessions managed. On success it
 * returns to the editor, where the session cookie now applies.
 *
 * The job jacket: this is the one chrome surface users meet outside the
 * editor, so it borrows the preview page's registration marks and sits on the
 * bench like a proof sheet pulled for inspection (DESIGN.md → Crop Marks).
 * Depth is declared once — the hairline — never a border+shadow stack.
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
          className="touch-target inline-flex select-none items-center rounded-control px-1 text-sm font-semibold tracking-tight outline-offset-2 outline-accent focus-visible:outline-2"
        >
          Perfect<span className="font-mono">Mark</span>D
        </Link>
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle theme={theme} onToggle={toggle} />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        <div className="pm-reg-marks relative w-full max-w-sm rounded-pane border border-hairline bg-surface">
          <span className="pm-reg-host absolute inset-0" aria-hidden="true" />
          <div className="p-6">
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

            {copy.colophon && (
              <p className="mt-5 border-t border-hairline pt-3 text-[11px] leading-relaxed text-ink-faint">
                {copy.colophon}
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
