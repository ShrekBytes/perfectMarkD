// ─────────────────────────────────────────────────────────────────────────────
// The Google Sign-In start path, agreed across three packages (regression for
// the 404 the deployed button led to).
//
// The bug this guards: the SPA's "Continue with Google" link pointed at
// /api/auth/google/start, but the server mounts the whole flow at /auth/google,
// at the app's root rather than under /api. Nothing served the path the SPA
// asked for, so the button led to a blank 404 in a real browser. Two unit tests
// missed it because both the component and its test were written against the
// same wrong path — they agreed with each other and with nothing else.
//
// So this does not re-pin a literal. It reads the path out of the SPA source,
// then asks the composed app whether that exact path answers. The three files
// that have to agree are the component (apps/web), the composition root's mount
// (apps/server/src/index.ts) and the two proxy tables (vite.config.ts, the
// Caddyfile) — the test lives on the server side because the server is what
// actually has the route.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../index.js';
import { createTestDatabase, removeTestDatabase } from '../db/testing.js';
import { testMailComposition } from '../auth/testing.js';
import { resolveGoogleSignIn } from './exchange.js';

/** The repo root as a URL, four levels up from this file (src/google → src →
 *  server → apps → root). Kept as a URL because the reads below resolve paths
 *  against it; read-only access to the two files in other packages. */
const REPO_ROOT = new URL('../../../../', import.meta.url);

/** One repo-relative file's source, as text. */
function readRepoFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, REPO_ROOT)), 'utf8');
}

/** The path the deployed button follows, read from the component's own source
 *  rather than copied into this test — the copy is what went stale. */
function readStartPathFromSpa(): string {
  const source = readRepoFile('apps/web/src/auth/GoogleSignIn.tsx');
  const match = source.match(/const START_PATH = '([^']+)'/);
  if (!match?.[1]) {
    throw new Error(
      'no START_PATH literal in apps/web/src/auth/GoogleSignIn.tsx — the button is wired some other way now, so this test is checking nothing.',
    );
  }
  return match[1];
}

/** A configured composition, so the flow is mounted the way it is in
 *  production: an absent OAuth client mounts no routes at all, which would
 *  make the assertion below pass for the wrong reason. */
function configuredApp() {
  const { db, dir } = createTestDatabase();
  cleanup = () => removeTestDatabase(dir);
  return createApp({
    db,
    log: () => {},
    sessionSecret: 'test-session-secret',
    now: () => new Date('2026-09-27T12:00:00Z'),
    adminEmail: null,
    ...testMailComposition(),
    google:
      resolveGoogleSignIn({
        clientId: 'client-id.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-secret',
        redirectUri: 'https://app.test/auth/google/callback',
      }) ?? null,
  });
}

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('the Google Sign-In start path the SPA links to', () => {
  it('is a route the server actually serves', async () => {
    const path = readStartPathFromSpa();
    const app = configuredApp();

    const res = await app.request(path);

    // 302 to Google's consent screen is the flow's first leg. Anything else —
    // 404 above all — is a path no one serves, which is the exact failure the
    // deployed button hit.
    expect(res.status, `${path} answered ${res.status}, not 302`).toBe(302);
    expect(res.headers.get('location')).toContain('accounts.google.com');
  });

  it('is proxied to the api in development and in production', () => {
    const path = readStartPathFromSpa();

    // Both proxies must forward the prefix the button uses, or the path
    // resolves to the SPA's index.html in dev and to Caddy's fallback in
    // production — 200s that are not the flow.
    const vite = readRepoFile('apps/web/vite.config.ts');
    const caddy = readRepoFile('Caddyfile');

    // Longest path segment, so '/auth/google/start' asks about '/auth/google'.
    const prefix = '/' + path.split('/').filter(Boolean).slice(0, 2).join('/');

    expect(vite, `apps/web/vite.config.ts proxies no '${prefix}'`).toContain(
      `'${prefix}'`,
    );
    expect(caddy, `Caddyfile matches no '${prefix}'`).toContain(prefix);
  });

  it('sits at the app root, where the registered redirect URI is a path the SPA fallback cannot swallow', () => {
    // The reason the flow is not under /api: the callback URI is registered
    // with Google, so it has to be an address the browser can come back to,
    // and Caddy would serve index.html for an unknown /api subpath. Asserted
    // here because it is the constraint a future refactor would break quietly.
    expect(readStartPathFromSpa().startsWith('/auth/google')).toBe(true);
  });
});
