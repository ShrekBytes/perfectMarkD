// ─────────────────────────────────────────────────────────────────────────────
// The Mailer seam (ADR-0013).
//
// One send operation per transactional email, and nothing else: the shape of
// every operation is an address plus, where the email carries one, an absolute
// one-time link. There is no operation that takes free text, a subject, or a
// Document — so no route can mail content the user wrote, whatever it means to
// (ADR-0013: no Document content ever leaves the browser).
//
// The seam is injected at the composition root the way the export renderer and
// the AI provider are: production passes the Resend client (resend.ts), a local
// operator can pass the console mailer (console.ts), and tests pass a fake that
// records sends. Nothing in this file sends anything.
//
// Every provider failure becomes the shared UpstreamError (see
// ../fetch-with-timeout.ts), so callers map failures without knowing the wire.
// No user-facing string names the provider — the same rule the AI routes
// follow — and the key never appears in a message, a log, or an error.
// ─────────────────────────────────────────────────────────────────────────────

/** A recipient: the one address the mail provider ever sees. */
export interface MailRecipient {
  to: string;
}

/**
 * Email Verification: a one-time link the account owner follows to confirm the
 * address. `url` is absolute and built by the caller, which is the only place
 * that knows the app's public origin.
 */
export interface VerificationEmail extends MailRecipient {
  url: string;
}

/**
 * Password Reset: a one-time link that sets a new password without signing in.
 * The Admin's reset link is the same email.
 */
export interface PasswordResetEmail extends MailRecipient {
  url: string;
}

/**
 * Email change: a one-time link mailed to the *new* address, which the owner
 * follows to swap the account's login address onto it. The Admin's change (when
 * email/05 lands) is the same email.
 */
export interface EmailChangeEmail extends MailRecipient {
  url: string;
}

/**
 * The notice the old address gets after an Email change, so a hijacker cannot
 * cut the owner off silently. It carries no link.
 */
export type EmailChangedNotice = MailRecipient;

export interface Mailer {
  sendVerification(email: VerificationEmail): Promise<void>;
  sendPasswordReset(email: PasswordResetEmail): Promise<void>;
  sendEmailChange(email: EmailChangeEmail): Promise<void>;
  sendEmailChangedNotice(email: EmailChangedNotice): Promise<void>;
}
