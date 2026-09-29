// ─────────────────────────────────────────────────────────────────────────────
// Google Sign-In, SPA side (google-signin/02): the button on /login and
// /register, and the sentence for a Google leg that failed.
//
// Three things it deliberately is not. Not a client-side OAuth flow: the button
// is a plain link to the server's start endpoint, because every leg of this
// flow is a browser navigation and the answers are redirects. Not a guess about
// the deployment: the button appears only when /api/auth/providers says the
// instance has an OAuth client, so an unconfigured Self-Hosted Instance shows
// no option that leads nowhere. And not a page that can fail on its own — a
// check that never lands renders no button, which is the same as a deployment
// without the feature.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { signInProviders } from './api';

/** Where the flow starts. Relative, so it is the same origin in development
 *  (Vite proxies it) and production (Caddy does). At the app's root, not under
 *  /api: the server mounts the whole Google flow at /auth/google, because the
 *  registered redirect URI is the address a person comes back to and has to be
 *  a path the SPA's deep-link fallback cannot swallow. Both proxies pass this
 *  path through (apps/web/vite.config.ts, Caddyfile). */
const START_PATH = '/auth/google/start';

/**
 * How the callback's outcome reached this page. The server answers every
 * failure with a redirect to `/login?google=<code>` — a browser navigation
 * never gets a JSON body — and the codes are stable while these sentences are
 * the SPA's to word.
 *
 * - `declined` — the user closed Google's consent screen. Not our failure.
 * - `error` — anything else: a callback we cannot vouch for, or a provider that
 *   would not answer. One answer, because the recovery is the same.
 * - `rate_limited` — too many attempts, too soon.
 */
export type GoogleFailure = 'declined' | 'error' | 'rate_limited';

/** Every failure names the same recovery: the password form is still on the
 *  page, and a user who was mid-sign-in has lost nothing. */
const FAILURE_COPY: Record<GoogleFailure, string> = {
  declined:
    'You closed the consent screen, so Google signed you in to nothing. Try again, or sign in with your password.',
  error:
    'Google sign-in didn’t finish — the connection or Google’s answer got in the way. Try again, or sign in with your password.',
  rate_limited:
    'Too many Google sign-in attempts just now. Wait a moment, or sign in with your password.',
};

function isGoogleFailure(code: string | null): code is GoogleFailure {
  return code === 'declined' || code === 'error' || code === 'rate_limited';
}

/**
 * The outcome the callback redirected with, or null when this page load did not
 * come from one. Read on every render rather than latched into state, so the
 * URL stays the one source of truth: switching between /login and /register
 * pushes a path with no code, and the notice goes with it.
 */
export function googleFailureFromUrl(): GoogleFailure | null {
  const code = new URLSearchParams(window.location.search).get('google');
  return isGoogleFailure(code) ? code : null;
}

export interface GoogleSignInProps {
  /** The failure the callback redirected with, if this page load came from one. */
  failure: GoogleFailure | null;
}

export function GoogleSignIn({ failure }: GoogleSignInProps) {
  const [advertised, setAdvertised] = useState(false);

  useEffect(() => {
    let live = true;
    // Absent, not broken: an unconfigured deployment — and a check that never
    // lands — renders no button at all.
    signInProviders()
      .then((providers) => {
        if (live) setAdvertised(providers.google);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  // The notice is not the button's to carry: a callback that failed while the
  // advertisement was unreachable is the case the notice exists for, so it
  // renders whatever the check said. Only the button waits on the check.
  if (!advertised && !failure) return null;

  return (
    <div data-testid="google-sign-in" className="mt-5">
      {failure && (
        <p
          role="alert"
          data-testid="google-sign-in-failure"
          className="mb-3 text-xs leading-relaxed text-danger"
        >
          {FAILURE_COPY[failure]}
        </p>
      )}

      {advertised && (
        <>
          <p className="text-center text-[11px] text-ink-faint">or</p>

          {/* A plain anchor, not the router's Link: the response is a redirect to
              Google's consent screen, which is a document load, not a route. */}
          <a
            href={START_PATH}
            className="touch-target mt-2 flex h-9 w-full items-center justify-center rounded-control border border-hairline text-sm font-medium text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2"
          >
            Continue with Google
          </a>
        </>
      )}
    </div>
  );
}
