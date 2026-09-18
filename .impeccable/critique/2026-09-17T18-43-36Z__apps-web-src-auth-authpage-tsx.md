---
target: login registration page (apps/web/src/auth/AuthPage.tsx + AuthForm.tsx)
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
p2_count: 2
target_identity: "file:/home/samy/Documents/GitHub/perfectMarkD/apps/web/src/auth/AuthPage.tsx"
target_fingerprint: "sha256:f30b761a22526c530f79a7fdc6a11e2340ead5b14e88fbbc2887f7782942840b"
target_path: /home/samy/Documents/GitHub/perfectMarkD/apps/web/src/auth/AuthPage.tsx
timestamp: 2026-09-17T18-43-36Z
slug: apps-web-src-auth-authpage-tsx
---
# Critique — `/login` & `/register`
**Target:** `apps/web/src/auth/AuthPage.tsx` (+ `AuthForm.tsx`) · **Mode:** Operate · **Slug:** `apps-web-src-auth-authpage-tsx`

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | "Please wait…" is good, but failure is generic and success silently redirects with no acknowledgement. |
| 2 | Match System / Real World | 3 | Plain labels, but register never says what an account is *for*; login says "Server Export" unexplained. |
| 3 | User Control and Freedom | 2 | No account recovery anywhere, no password reveal; mode switch works and preserves input. |
| 4 | Consistency and Standards | 3 | Autofill/required correct, but the home wordmark loses the system's 2px graphite focus ring. |
| 5 | Error Prevention | 2 | Register's 8-char rule is invisible until failure; no reveal, no confirm field. |
| 6 | Recognition Rather Than Recall | 3 | Visible labels, but no helper text and no stated account purpose. |
| 7 | Flexibility and Efficiency | 3 | Enter submits; correct `current-/new-password` autofill; no reveal, no caps-lock cue. |
| 8 | Aesthetic and Minimalist Design | 4 | Genuinely clean, calm hierarchy, no clutter. |
| 9 | Error Recovery | 2 | `role="alert"` present, but not tied to any field; message names neither cause nor fix. |
| 10 | Help and Documentation | 1 | No password guidance, no recovery help, no terms/contact. |
| **Total** | | **26/40** | **Acceptable** (65%) |

## Design Specificity Verdict

**LLM assessment:** *Token-faithful, compositionally anonymous.* The page proves it knows the Light Table's palette — cool graphite, `bg-surface` card, 2px radii, IBM Plex Sans, the mono "Mark" in the wordmark, and a graphite-inversion submit button that correctly flips to near-white in dark mode.

But the composition is the default centered auth card: 48px header, centered `max-w-sm` card, 18px/600 heading, 12px blurb, two stacked fields, full-width filled button, footer switch link. **The world's one authored moment — the printer's crop marks, which `DESIGN.md` line 285 calls "the world's one authored moment" — does not appear.** Verdict: generic-aware-but-not-authored — it inherits the tokens, not the idea.

It also breaks two stated rules: a border+shadow stack on the card (banned by `DESIGN.md` line 363), and a focus ring that abandons the "uniformly, non-negotiably" rule on the home link (line 232).

**Deterministic scan:** `impeccable detect --json apps/web/src/auth` → exit **0, zero findings** (re-run per file, still clean). In-page detector agreed: `[impeccable] No anti-patterns found.` Every problem below is a judgment call the machine can't make. No false positives.

**Visual overlays:** None. Mutable injection was confirmed to run in the page, but the detector only builds a DOM overlay when it finds anti-patterns — it found none, so no visible overlay exists.

## Overall Impression

A clean, keyboard-literate, contrast-solid auth form that would pass most code reviews — and that is exactly the problem. It is the safe version of this page. The biggest miss is not visual: this page makes an irreversible credential decision trivially easy to get wrong and offers no way back, then tells the new user in its first sentence that keeping the password safe is their problem.

## What's Working

1. **Keyboard and focus discipline — for every control but one.** Tab order is logical (home → theme toggle → email → password → submit → mode switch) with no traps; five of six controls show the system's 2px solid `--accent` ring at 2px offset.
2. **Correct, modern autofill wiring.** `type=email` + `autocomplete=email`, `current-password` on login, `new-password` on register — the latter enables password-manager generation.
3. **Tokens and contrast hold in both themes.** Measured ratios (light / dark): heading 15.3 / 12.9; blurb & labels 6.36 / 6.73; input text 13.88 / 14.73; button 16.71 / 14.73. Nothing below AA.
4. **Mode switching preserves typed input.** Values survive login → register → login.

## Priority Issues

### [P1] The register password rule (`minLength=8`) is never communicated
- **What:** `/register`'s password carries `minlength=8`, but no helper, counter, or rule text exists. The only feedback is the browser's native post-submit popup.
- **Why it matters:** the user submits and is told they were wrong — an avoidable failure. Screen-reader users learn the rule only from a transient popup. `DESIGN.md` line 353 requires error copy that names the problem and the recovery; the constraint fails before the user can see it.
- **Fix:** persistent helper "At least 8 characters" wired via `id` + `aria-describedby`, with a live check while typing.

### [P1] No account-recovery path, and the register copy makes it worse
- **What:** `/login` has no "Forgot password?" link or reset route. `/register`'s blurb is *"Free to use. No email verification — keep your password safe."*
- **Why it matters:** an account is the key to a paid plan and Export History (`CONTEXT.md`). Losing the password with no recovery is discovered only after lockout, and the one sentence of "help" shifts risk onto the user. **"Free to use" is misleading**: the Free Tier requires no account at all.
- **Fix:** add a "Forgot password?" affordance and an honest recovery path; rewrite the register blurb to lead with what an account buys, keep the honest warning, drop the blame.

### [P1] The mode-switch link is a 15px-tall tap target on phones
- **What:** at 375px and 320px, "Create one" / "Sign in" measures **59.5 × 15px** with no `touch-target` class, while every other control floors at 44×44. The wordmark link is 22.5px tall.
- **Why it matters:** it is the primary route to registration, rendered as a thin strip of 12px text inside a sentence. `DESIGN.md`'s 44 Rule explicitly lists "the payment and auth fields" as in scope (line 189).
- **Fix:** give the switch control `touch-target`, or promote it to a full-width 36/44px ghost button in the footer; floor the wordmark too.

### [P2] Failure state is vague, unassociated, and leaks across modes
- **What:** with the API down, submit renders `role="alert"` text **"Something went wrong."** in `--danger` (contrast 5.03 surface / 4.56 canvas — passes). No input carries `aria-invalid`/`aria-describedby`, and the error persists when switching modes.
- **Why it matters:** the user can't tell an outage from bad credentials, can't tell which field to fix, and is shown an error belonging to a screen they left. Contradicts `DESIGN.md` line 353.
- **Fix:** classify errors (offline/5xx vs 401), clear `error` on mode change, set `aria-invalid`/`aria-describedby`.

### [P2] The card violates the Elevation rule; the home link violates the focus rule
- **What:** the card is `border border-hairline … shadow-sm` — a shadow + border stack, banned by `DESIGN.md` line 363. The home wordmark relies on the UA default 1px `auto` outline instead of the token ring, against the "uniformly, non-negotiably" focus rule (line 232).
- **Why it matters:** these are the two places the page visibly stops being the system. The missing ring is inconsistent focus visibility, especially in dark mode.
- **Fix:** drop `shadow-sm` from the card (keep the hairline), and add the standard focus classes to the wordmark link.

## Persona Red Flags

**Jordan (first-timer):** Register says "Free to use," but the Free Tier needs no account, so Jordan can't tell why he's signing up. He types a 7-char password, gets no warning, submits, and meets a browser bubble he may not connect to a rule. With the API down, "Something went wrong." leaves him unsure whether an account exists.

**Sam (screen reader / keyboard):** After a failure, `role="alert"` announces "Something went wrong." but neither input carries `aria-invalid`/`aria-describedby`. The 8-char rule exists only in a native popup after submit. The home link gets the browser's default 1px ring, and "Please wait…" has no live region. Both routes share `<title>PerfectMarkD</title>`.

**Casey (mobile):** The mode-switch link is 59.5 × 15px — the easiest thing to miss, and the path to registration. No password reveal and no confirm field means one typo on an account with no reset is unrecoverable. Layout itself is clean (no overflow at 375/320).

## Minor Observations

- **Register "Free to use" contradicts `CONTEXT.md`** (Free Tier needs no account).
- **`--field` conflict in `DESIGN.md`:** the Field Flips Rule (line 79) says typed-into surfaces use `--field`, while line 267 says full-width form fields use `--canvas` fill. The code follows `--canvas`; one line is stale.
- **Wordmark is `text-[15px]`** vs the 14px spec (line 97).
- **Primary button has no `shadow-sm`** though line 225 gives the primary that lift.
- **Link text isn't self-describing:** "Create one" has no antecedent in a link list.
- **`<form>` has no `action`/`method` override** — with JS broken it would `GET /login?email=…&password=…`.
- **Mode-switch side effect:** a login password carries into the register `new-password` field under a different validation contract.
- **No Terms/Privacy line** and no success acknowledgement (`aria-live`).

## Questions to Consider

1. If an account only exists to hold a paid plan and Export History, why does `/register` read like a generic free-SaaS signup — and should "Free to use" even be there?
2. Is the hidden 8-char rule the real flaw, or is password auth *without reset* the real design?
3. Should auth be the "job jacket" of the bench rather than the one surface that opts out of the world's one authored moment?
4. Should the mode switch carry the login password into the create-account field — or is the silence the bug?
