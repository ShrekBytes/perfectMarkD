// ─────────────────────────────────────────────────────────────────────────────
// Which address this tab last asked us to mail a link to, so the page that
// follows can name it (the user has to know which inbox to open).
//
// Two flows want it, and each keeps its own address: Email Verification, whose
// link proves the inbox, and Password Reset, whose link opens the account. A tab
// that has done both is asked two different questions, and naming the wrong
// address in either answer would send someone to the wrong inbox.
//
// sessionStorage, not the query string: an address in a URL lands in browser
// history and in any Referer the page ever sends. It is not a secret — it is
// the address the user just typed — but it has no business being a URL.
//
// sessionStorage rather than component state, because the page has to survive a
// refresh: without it, reloading after "Send the link" shows the form again and
// the user cannot tell whether anything was sent.
// ─────────────────────────────────────────────────────────────────────────────

const VERIFICATION_KEY = 'pmd:pending-verification-email';
const RESET_KEY = 'pmd:pending-reset-email';

function remember(key: string, email: string): void {
  try {
    sessionStorage.setItem(key, email);
  } catch {
    // A browser that refuses storage (private mode, blocked cookies) still gets
    // a working page — it just cannot name the address.
  }
}

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function rememberVerificationEmail(email: string): void {
  remember(VERIFICATION_KEY, email);
}

export function readVerificationEmail(): string | null {
  return read(VERIFICATION_KEY);
}

export function rememberResetEmail(email: string): void {
  remember(RESET_KEY, email);
}

export function readResetEmail(): string | null {
  return read(RESET_KEY);
}
