// ─────────────────────────────────────────────────────────────────────────────
// The transactional copy: one subject and one plain-text body per email.
//
// Plain text on purpose. There is no HTML part to build, escape, or preview,
// and a message that can only be plain text cannot smuggle a rendered Document
// into an inbox (ADR-0013). What each body holds is the address it went to, a
// sentence or two of our own words, and the one-time link — which is why the
// Privacy page can promise that email carries no more than that.
//
// Each email is only sent once the flow that sends it lands, so a body may
// point at a page that a later ticket builds.
// ─────────────────────────────────────────────────────────────────────────────

export interface OutboundEmail {
  subject: string;
  text: string;
}

/** Email Verification — sent by registration and by every resend. */
export function verificationMessage(to: string, url: string): OutboundEmail {
  return {
    subject: 'Verify your PerfectMarkD email address',
    text: [
      'Verify your email address',
      '',
      `Verify ${to} to finish setting up your PerfectMarkD account. Sign-in stays locked until you do.`,
      '',
      url,
      '',
      'This link works once. If you did not ask for a PerfectMarkD account, ignore this message — nothing was created.',
    ].join('\n'),
  };
}

/** Password Reset — sent by a reset request, and by the Admin panel. */
export function passwordResetMessage(to: string, url: string): OutboundEmail {
  return {
    subject: 'Reset your PerfectMarkD password',
    text: [
      'Reset your password',
      '',
      `Someone asked to reset the password for ${to}. If it was you, open this link to choose a new one:`,
      '',
      url,
      '',
      'This link works once, and choosing a new password signs out your other devices. If you did not ask for it, nothing has changed — ignore this message.',
    ].join('\n'),
  };
}

/** Email change — the link that swaps the account's login address onto `to`. */
export function emailChangeMessage(to: string, url: string): OutboundEmail {
  return {
    subject: 'Confirm your new PerfectMarkD login email',
    text: [
      'Confirm your new login email',
      '',
      `Your PerfectMarkD login email was changed to ${to}. Open this link to make it your login email — nothing changes until you do, and your password stays the same.`,
      '',
      url,
      '',
      'This link works once. If you did not ask to change your login email, ignore this message — nothing has changed until you open it.',
    ].join('\n'),
  };
}

/** The courtesy notice the old address gets after an Email change. */
export function emailChangedNoticeMessage(to: string): OutboundEmail {
  return {
    subject: 'Your PerfectMarkD login email changed',
    text: [
      'Your login email changed',
      '',
      `The login email on your PerfectMarkD account was changed, so ${to} is no longer it. If that was you, nothing to do. If it wasn't, use the password reset flow on the sign-in page right away to secure the account.`,
    ].join('\n'),
  };
}
