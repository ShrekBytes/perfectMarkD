// ─────────────────────────────────────────────────────────────────────────────
// The fake Mailer tests inject at the composition root.
//
// It records every send instead of performing one, so a test can assert what a
// user would have received — the address, and the one-time link — without a
// provider, a network, or a DNS zone. Production never constructs it: the boot
// gate (config.ts) decides between the Resend client and the console mailer, and
// tests inject this in place of both.
// ─────────────────────────────────────────────────────────────────────────────

import type { Mailer } from './mailer.js';

export type RecordedSendKind =
  'verification' | 'password_reset' | 'email_changed_notice';

export interface RecordedSend {
  kind: RecordedSendKind;
  to: string;
  /** The one-time link, for the emails that carry one. */
  url?: string;
}

export interface RecordingMailer extends Mailer {
  readonly sends: RecordedSend[];
  /** The most recent link sent to `to`; throws when nothing was. */
  linkTo(to: string): string;
  /** The one-time token in the most recent link sent to `to`. */
  tokenTo(to: string): string;
}

export function createRecordingMailer(): RecordingMailer {
  const sends: RecordedSend[] = [];
  const latest = (to: string) =>
    [...sends].reverse().find((send) => send.to === to && send.url);
  return {
    sends,
    async sendVerification({ to, url }) {
      sends.push({ kind: 'verification', to, url });
    },
    async sendPasswordReset({ to, url }) {
      sends.push({ kind: 'password_reset', to, url });
    },
    async sendEmailChangedNotice({ to }) {
      sends.push({ kind: 'email_changed_notice', to });
    },
    linkTo(to) {
      const url = latest(to)?.url;
      if (!url) throw new Error(`no link was sent to ${to}`);
      return url;
    },
    tokenTo(to) {
      const token = new URL(this.linkTo(to)).searchParams.get('token');
      if (!token) throw new Error(`the link sent to ${to} carries no token`);
      return token;
    },
  };
}
