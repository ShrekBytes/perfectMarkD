// ─────────────────────────────────────────────────────────────────────────────
// The console Mailer: the local development escape from the boot gate.
//
// It prints each email to the server log instead of sending it, so an operator
// running the API on their own machine can follow a one-time link with no
// provider account and no DNS to set up. The cost is the obvious one — a
// one-time link is a credential, so it lands in the log file — which is why
// this is reachable only by asking for it by name (MAIL_MODE=console, see
// config.ts) and never by leaving configuration out.
//
// Tests do not use this: they inject a fake that records sends.
// ─────────────────────────────────────────────────────────────────────────────

import { consoleSink, type LogSink } from '../request-logger.js';
import type { Mailer } from './mailer.js';

export function createConsoleMailer(log: LogSink = consoleSink): Mailer {
  return {
    async sendVerification({ to, url }) {
      log(`console mail: verification link for ${to} → ${url}`);
    },
    async sendPasswordReset({ to, url }) {
      log(`console mail: password reset link for ${to} → ${url}`);
    },
    async sendEmailChangedNotice({ to }) {
      log(`console mail: email-changed notice for ${to}`);
    },
  };
}
