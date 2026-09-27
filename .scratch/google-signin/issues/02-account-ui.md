# 02 — Account UI: Google button, set password, sign-in method

Status: resolved
Blocked by: google-signin/01, google-signin/01b

The SPA surface: a Google Sign-In button on the sign-in/registration pages,
rendered only when the server advertises the feature (absent, never broken,
when unconfigured), with a clear inline fallback when Google's leg fails
(cancelled consent, network). The Account page renders the two states 01b makes
readable — a "Set password" section for an account with no password of its own,
and a line showing the account's sign-in methods — off the sign-in-methods
block, and shows the ordinary Change Password form when the account has a
password. The Privacy page gets a Google Sign-In section **appended to the
structure email/01 established** — no restructuring of the page; the copy must
hold ADR-0010's scoped claim (a user-initiated redirect to Google is not the
page loading a third-party resource).

**Accepts**: component tests with mocked clients (prior art: the Account page
tests) cover button presence given the server's advertisement, the failure
fallback, and the Account page states.

## Comments

- Nothing here needs Google credentials: the button is a plain link to the start
  endpoint, its visibility reads the server's advertisement, and the fallback
  reads the code the callback redirected with. Only the real round trip through
  Google's consent screen does, and the spec already rules that out of CI.
- The button lives in `AuthPage`, not in `AuthForm`. Two reasons: an anchor
  inside the form's `<form>` would submit it, and the upgrade dialog (billing/01)
  embeds the same form — a full-page navigation out of a modal is not where this
  belongs. The dialog's account step therefore has no Google button; the
  standalone pages do, and that is what the ticket asked for.
- **The notice is not the button's to carry.** A callback that failed over the
  same bad connection that took `/api/auth/providers` down renders the message
  anyway (story 9), with no button to retry — the check is what would have drawn
  it. Only the button waits on the advertisement.
- `?google=<code>` is read on every render rather than latched into state, so
  the URL stays the one source of truth: switching between /login and /register
  pushes a path with no code and the notice goes with it. It is not stripped
  from the address bar (it is a status, not a credential), so a reload repeats
  the same honest sentence.
- **The Account page's password section is a caption plus a form, not a pane of
  its own** (`PasswordSection`): the sign-in-methods line sits above whichever
  form matches, aligned to that pane's text column, so the page keeps one border
  per section. `signIn === null` renders Change Password, not Set Password — an
  unreported block is not a claim that the account has no password.
- The Set Password confirmation is the section's own state, and `ChangePasswordForm`
  grew one optional `onChanged` so its success stands the earlier one down: both
  say the same thing about other devices, and saying it twice reads as two
  events.
- `SetPasswordForm` is deliberately `ChangePasswordForm` without the
  current-password field and its check, and the copy names no sign-in method —
  the section serves every account without a password, whatever it signed in
  with. A shared shell between the two was not extracted; the same duplication
  already exists between `AuthForm` and `ChangePasswordForm`, and folding all
  three together is not this ticket's change.
- The Privacy section went in after Email rather than at the end of the page:
  the two are the auth flows with third parties, and appending it to the
  structure email/01 established is not the same as appending to the bottom of
  the document. Nothing existing moved. "What is stored" was left alone — its
  "nothing else" bullet is scoped by its own colon to Document content, and the
  two stored identity fields are named in the new section, the way the Email
  section names the address and the link digest.
- Verified in a real browser (Chromium, Vite dev): the button appears and
  disappears with the advertisement, the failure notice renders in the proof
  sheet, and the Account page swaps Set Password for Change Password with the
  line and the confirmation both keeping up. No console errors.
