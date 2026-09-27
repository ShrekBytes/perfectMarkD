// ─────────────────────────────────────────────────────────────────────────────
// Which address the last verification link went to, so the check-your-inbox
// page can name it (story 2: the user has to know which inbox to open).
//
// sessionStorage, not the query string: an address in a URL lands in browser
// history and in any Referer the page ever sends. It is not a secret — it is
// the address the user just typed — but it has no business being a URL.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = 'pmd:pending-verification-email';

export function rememberVerificationEmail(email: string): void {
  try {
    sessionStorage.setItem(KEY, email);
  } catch {
    // A browser that refuses storage (private mode, blocked cookies) still gets
    // a working page — it just cannot name the address.
  }
}

export function readVerificationEmail(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}
