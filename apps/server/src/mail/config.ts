// ─────────────────────────────────────────────────────────────────────────────
// Where the deployment's mail configuration becomes a Mailer — the composition
// root's one call, and the boot gate beside it (ADR-0013).
//
// Email is load-bearing for account access: sign-in is blocked until an address
// is verified, and a password reset is the only self-service way back in. A
// deployment that cannot send mail is therefore an instance nobody can use, so
// this refuses rather than starting one. The mailer is deliberately not
// switchable off (ADR-0013) — there is no mode that sends nothing and reports
// success.
//
// The one way out is asking for it by name: MAIL_MODE=console selects the
// console mailer (console.ts), which prints links to the server log. Silence is
// never enough, so the escape cannot double as the accident it exists to
// prevent. Any other value of MAIL_MODE is not a mode at all, and the gate stays
// shut — `MAIL_MODE=off` boots nothing.
//
// The origin the links are built from is gated here too (requirePublicOrigin),
// so both halves of "this instance can email a working link" are decided in one
// place beside each other.
// ─────────────────────────────────────────────────────────────────────────────

import type { LogSink } from '../request-logger.js';
import { createConsoleMailer } from './console.js';
import type { Mailer } from './mailer.js';
import { createResendMailer } from './resend.js';

/** The only mode that is not the provider. See the note above. */
export type MailMode = 'console';

export interface MailOptions {
  /** The deployment's provider key (RESEND_API_KEY). */
  apiKey?: string | null;
  /** The from-address, as the provider takes it (MAIL_FROM). */
  from?: string | null;
  /** MAIL_MODE; `console` prints instead of sending. */
  mode?: MailMode | null;
  /** Where the console mailer writes; defaults to the process log. */
  log?: LogSink;
}

export function resolveMail({
  apiKey,
  from,
  mode,
  log,
}: MailOptions = {}): Mailer {
  if (mode === 'console') return createConsoleMailer(log);
  if (!apiKey) {
    throw new Error(
      'RESEND_API_KEY is required — a user cannot verify an email address or reset a password without it. Create one in your mail provider dashboard. For local development, MAIL_MODE=console prints the links to the server log instead.',
    );
  }
  if (!from) {
    throw new Error(
      'MAIL_FROM is required — the address transactional email is sent from, e.g. "PerfectMarkD <hello@perfectmarkd.00022000.xyz>".',
    );
  }
  return createResendMailer({ apiKey, from });
}

/**
 * The fourth boot gate (email/02), beside the three above: the one-time links
 * in transactional email are absolute, and only the deployment knows the
 * address users' browsers reach the instance on. It is required rather than
 * defaulted, because the failure it prevents is invisible until a user clicks
 * a dead link in a real inbox.
 *
 * EXPORT_ORIGIN is not a substitute: on a deployment behind a tunnel it is
 * `http://caddy`, a name that resolves only inside the compose network, correct
 * for the export worker's hidden render surface and useless in an inbox.
 * Deriving it from the request is not one either — Host is attacker-supplied,
 * and a link we send to an attacker's page from our domain carries our DKIM
 * signature and passes spam filtering precisely because it is really from us.
 */
export function requirePublicOrigin(publicOrigin: string | null): string {
  if (publicOrigin) return publicOrigin;
  throw new Error(
    'PUBLIC_ORIGIN is required — the address users reach this instance on, which the verification and password-reset links in transactional email are built from, e.g. https://perfectmarkd.example.com',
  );
}
