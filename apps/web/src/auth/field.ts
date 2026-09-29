// The form field the auth and account surfaces share, declared once.
//
// The sign-in form, the resend-verification field, the three password surfaces
// and the login-email section all render the same control: 36px, `--canvas`
// fill, hairline, the 2px accent ring on focus, and the 44px coarse-pointer
// floor. It is one string because the styling is one design, and a seventh copy
// is where a DESIGN.md change would have to be applied seven times.

/** The two fields share one control: same geometry, same ring, same touch
 *  floor. */
export const INPUT_CLASS =
  'touch-target mt-1 block h-9 w-full rounded-control border border-hairline bg-canvas px-2.5 text-sm text-ink outline-offset-2 outline-accent focus-visible:outline-2';

/** The policy the server enforces on new passwords (server/02). */
export const PASSWORD_MIN = 8;

/**
 * The hint under a new-password field: the policy, and how much is still
 * missing to reach it. An empty field states the policy alone — there is
 * nothing to count yet. Computed one way so the four surfaces that render it
 * cannot disagree about the arithmetic.
 */
export function passwordHint(length: number): string {
  return length > 0 && length < PASSWORD_MIN
    ? `At least ${PASSWORD_MIN} characters — ${PASSWORD_MIN - length} more needed.`
    : `At least ${PASSWORD_MIN} characters.`;
}
