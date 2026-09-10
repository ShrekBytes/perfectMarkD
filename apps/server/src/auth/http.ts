import type { Context } from 'hono';
import { setCookie, setSignedCookie } from 'hono/cookie';
import type { AppEnv } from '../index.js';
import { SESSION_COOKIE, SESSION_TTL_MS } from './sessions.js';

/**
 * Transport-level helpers shared by the session middleware (index.ts) and the
 * auth routes, so the cookie attributes and proxy-header parsing exist once.
 */

/**
 * The hop appended by our trusted reverse proxy. Caddy *appends* the client IP
 * to any inbound `x-forwarded-for`, so the last entry is the one it observed;
 * earlier entries are client-controlled and must not key rate limits.
 */
function forwardedFor(c: Context<AppEnv>, header: string): string | undefined {
  const value = c.req.header(header);
  const last = value?.split(',').at(-1)?.trim();
  return last ? last : undefined;
}

/** Client IP for rate-limit keys. Caddy also sets `x-real-ip`. */
export function clientIp(c: Context<AppEnv>): string {
  return (
    forwardedFor(c, 'x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown'
  );
}

/** True when the request reached us over TLS, directly or via the proxy. */
export function isHttps(c: Context<AppEnv>): boolean {
  const proto = forwardedFor(c, 'x-forwarded-proto');
  if (proto) return proto === 'https';
  return new URL(c.req.url).protocol === 'https:';
}

/**
 * Issues the rolling session cookie. `secure` is set whenever the request
 * arrived over HTTPS — plain-http localhost must still work, so it can't be
 * unconditional.
 */
export function setSessionCookie(
  c: Context<AppEnv>,
  secret: string,
  token: string,
): Promise<void> {
  return setSignedCookie(c, SESSION_COOKIE, token, secret, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    secure: isHttps(c),
  });
}

export function clearSessionCookie(c: Context<AppEnv>): void {
  setCookie(c, SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 0,
    secure: isHttps(c),
  });
}
