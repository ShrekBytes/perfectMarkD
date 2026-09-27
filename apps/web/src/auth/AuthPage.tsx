import { navigate } from '../router';
import { AuthForm, type AuthMode } from './AuthForm';
import { AuthPageShell } from './AuthPageShell';
import { useAccountStore } from './account-store';
import { rememberVerificationEmail } from './pending-verification';

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
    blurb: 'An account lets you take a Premium plan — with Export History.',
    // Verification is the one step between here and signing in, so it is stated
    // before it happens rather than discovered afterwards.
    colophon:
      'We email you a one-time link to verify your address. Sign-in stays locked until you open it.',
  },
} as const;

/**
 * The standalone /login and /register pages. Free users only meet these via
 * the upgrade flow's in-dialog account step (billing/01); this page exists so
 * accounts can be reached directly and sessions managed. A successful sign-in
 * returns to the editor, where the session cookie now applies; a successful
 * registration has no session to apply yet (email/02), so it goes to the
 * check-your-inbox page instead.
 */
export function AuthPage({ mode }: AuthPageProps) {
  const copy = COPY[mode];
  const signedIn = useAccountStore((state) => state.signedIn);

  return (
    <AuthPageShell>
      <h1 className="text-lg font-semibold tracking-tight">{copy.heading}</h1>
      <p className="mt-1 text-xs text-ink-soft">{copy.blurb}</p>

      <div className="mt-5">
        <AuthForm
          mode={mode}
          onAuthenticated={(user) => {
            signedIn(user);
            navigate('/');
          }}
          onRegistered={(email) => {
            // The page that follows needs to know which inbox to name; the URL
            // is the wrong place for an address.
            rememberVerificationEmail(email);
            navigate('/check-inbox');
          }}
        />
      </div>

      {copy.colophon && (
        <p className="mt-5 border-t border-hairline pt-3 text-[11px] leading-relaxed text-ink-faint">
          {copy.colophon}
        </p>
      )}
    </AuthPageShell>
  );
}
