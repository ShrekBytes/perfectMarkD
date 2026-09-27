import { AuthPageShell, SignInFooter } from './AuthPageShell';
import { ResendVerification } from './ResendVerification';
import { readVerificationEmail } from './pending-email';

/**
 * Where a new registration lands: the address is named, the next step is
 * stated, and the resend is one click away (story 2 — "which inbox do I open?",
 * and story 5 — a lost email must not lock anyone out).
 *
 * The address comes from this tab's session, not the URL, so the page is honest
 * even when it is opened cold: it still says what to do, just without naming an
 * inbox it has no record of.
 */
export function CheckInboxPage() {
  const email = readVerificationEmail();

  return (
    <AuthPageShell>
      <h1 className="text-lg font-semibold tracking-tight">Check your inbox</h1>
      {email ? (
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          We sent a verification link to{' '}
          <span className="font-mono font-medium text-ink">{email}</span>. Open
          it to finish setting up your account — sign-in stays locked until you
          do.
        </p>
      ) : (
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          We sent a verification link to the address you registered with. Open
          it to finish setting up your account — sign-in stays locked until you
          do.
        </p>
      )}

      <ResendVerification email={email ?? undefined} />

      <SignInFooter>Already verified?</SignInFooter>
    </AuthPageShell>
  );
}
