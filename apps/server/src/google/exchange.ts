// ─────────────────────────────────────────────────────────────────────────────
// The identity-exchange seam (google-signin/01) and its production Google
// client.
//
// One authorization code in, one verified identity out: the provider's stable
// account id (`sub`) and the address it has proven. Nothing else comes back —
// no contacts, no files, no profile pictures — and nothing is stored here; the
// callback decides what an identity means for an account.
//
// The seam is injected at the composition root the way the Mailer is, and for
// the same reason: every test runs against a fake that returns canned
// identities, and nothing but this file knows Google's wire. The credentials
// come from the deployment's environment and never reach a message, a log, or
// a response.
//
// Unconfigured is a complete instance, not a degraded one, so there is no boot
// gate here (unlike ADR-0013's mailer): `resolveGoogleSignIn` returns null, the
// routes are not mounted, and the SPA's button stays hidden.
// ─────────────────────────────────────────────────────────────────────────────

/** What Google's identity answer is reduced to: an id and a proven address. */
export interface GoogleIdentity {
  /** Google's `sub` — stable for the life of the Google account. */
  subject: string;
  /** The address, which Google has verified (`email_verified`). */
  email: string;
}

/**
 * The seam: one authorization code, one identity. Throws
 * `GoogleExchangeError` for every failure — a callback cannot act on a partial
 * answer, so there is no null to handle.
 */
export type IdentityExchange = (code: string) => Promise<GoogleIdentity>;

export const GOOGLE_EXCHANGE_ERROR_CODES = [
  'transport',
  'timeout',
  'http',
  'invalid_response',
] as const;
export type GoogleExchangeErrorCode =
  (typeof GOOGLE_EXCHANGE_ERROR_CODES)[number];

/** Every exchange failure, in one shape. `message` is safe to log: it never
 *  names the client secret or echoes the code, and it carries the status when
 *  there was one, so nothing else needs a field. */
export class GoogleExchangeError extends Error {
  constructor(
    readonly code: GoogleExchangeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GoogleExchangeError';
  }
}

/**
 * The non-sensitive scopes, and the only ones requested: a name, an email
 * address, and a basic profile. Nothing that would put this app through Google's
 * sensitive-scope verification.
 */
const SCOPES = ['openid', 'email', 'profile'];

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

/** A handshake that has not answered in this long has failed. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** What the routes are given: the client to send the browser to, and the seam
 *  that trades the code it comes back with. Absent configuration is null. */
export interface GoogleSignIn {
  clientId: string;
  /** The redirect URI registered with the OAuth client. */
  redirectUri: string;
  exchange: IdentityExchange;
}

export interface GoogleSignInOptions {
  clientId?: string | null;
  clientSecret?: string | null;
  redirectUri: string;
  /** The exchange seam; defaults to the real Google client. */
  exchange?: IdentityExchange;
}

/**
 * The composition root's one call, beside `resolveMail`. Either half of the
 * client id/secret pair counts as unconfigured: a deployment missing one is a
 * deployment that has not set this feature up, and a half-configured instance
 * must not show a button that leads to an error page at Google.
 */
export function resolveGoogleSignIn({
  clientId,
  clientSecret,
  redirectUri,
  exchange,
}: GoogleSignInOptions): GoogleSignIn | null {
  const id = clientId?.trim();
  const secret = clientSecret?.trim();
  if (!id || !secret) return null;
  return {
    clientId: id,
    redirectUri,
    exchange:
      exchange ??
      createGoogleIdentityExchange({
        clientId: id,
        clientSecret: secret,
        redirectUri,
      }),
  };
}

/**
 * The address the browser is sent to, carrying the one-time `state` that binds
 * the callback to the browser that started it.
 */
export function authorizationUrl({
  clientId,
  redirectUri,
  state,
}: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

export interface GoogleIdentityExchangeOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Per-request deadline in milliseconds (default 10s). */
  timeoutMs?: number;
}

/**
 * The real client: one POST to the token endpoint, then one GET to the
 * userinfo endpoint with the token it handed back. Two calls, because the
 * id_token that comes with the exchange is only trustworthy once its signature
 * has been checked against Google's keys — asking Google who the token belongs
 * to is the check.
 */
export function createGoogleIdentityExchange({
  clientId,
  clientSecret,
  redirectUri,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: GoogleIdentityExchangeOptions): IdentityExchange {
  return async function exchange(code: string): Promise<GoogleIdentity> {
    const token = await getJson(
      TOKEN_URL,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }).toString(),
      },
      timeoutMs,
    );
    const accessToken = readAccessToken(token);

    const profile = await getJson(
      USERINFO_URL,
      { headers: { authorization: `Bearer ${accessToken}` } },
      timeoutMs,
    );
    return readIdentity(profile);
  };
}

/** One GET/POST to Google, with its deadline, mapped onto the one error shape. */
async function getJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new GoogleExchangeError(
        'http',
        `The sign-in provider answered with HTTP ${response.status}.`,
      );
    }
    return await response.json();
  } catch (error) {
    if (error instanceof GoogleExchangeError) throw error;
    if (isAbortError(error)) {
      throw new GoogleExchangeError(
        'timeout',
        'The sign-in provider did not answer in time.',
      );
    }
    throw new GoogleExchangeError(
      'transport',
      'The sign-in provider could not be reached.',
    );
  } finally {
    clearTimeout(timer);
  }
}

function readAccessToken(payload: unknown): string {
  const token = (payload as { access_token?: unknown } | null)?.access_token;
  if (typeof token !== 'string' || !token) {
    throw new GoogleExchangeError(
      'invalid_response',
      'The sign-in provider accepted the code without an access token.',
    );
  }
  return token;
}

/**
 * An identity is only an identity if both halves are there and Google says it
 * verified the address. A profile that says otherwise is treated as no
 * identity at all rather than as a weaker one: this address is what the app
 * marks verified and what the auto-link rule matches accounts on, so an
 * unverified one must never reach the database.
 */
function readIdentity(payload: unknown): GoogleIdentity {
  const record = payload as {
    sub?: unknown;
    email?: unknown;
    email_verified?: unknown;
  } | null;
  const subject = record?.sub;
  const email = record?.email;
  if (
    typeof subject !== 'string' ||
    !subject ||
    typeof email !== 'string' ||
    !email ||
    record?.email_verified !== true
  ) {
    throw new GoogleExchangeError(
      'invalid_response',
      'The sign-in provider returned an identity without a verified email address.',
    );
  }
  return { subject, email };
}

function isAbortError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'AbortError' || name === 'TimeoutError';
}
