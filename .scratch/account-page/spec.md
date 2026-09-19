# Account page

Status: ready-for-agent

## Problem Statement

A signed-in user has no place to see their Account. The things an account owns
are scattered across a dropdown menu and dialogs: plan status lives in an
"Upgrade status" dialog, Export History in another dialog, Quota usage only as
a small top-bar chip, and Orders (payment status) are invisible — a user who
sent a Manual Payment has no way to see whether the Admin verified it. The
change-password endpoint exists but has no UI at all, so a user who wants a new
password must ask the Admin for a temporary one.

## Solution

A dedicated Account page at `/account` that consolidates everything the
account owns in one calm, single-column page: current plan and Plan Expiry,
Quota usage, a compact list of Orders with status badges, the Export History
section (moved out of its dialog), and an inline change-password section. The
AccountMenu shrinks to **Account** and **Sign out** (plus **Sign in** when
signed out) and the two dialogs it used to open are deleted.

## User Stories

1. As a signed-in user, I want a single Account page, so that I can manage everything about my account in one place instead of hunting through menus and dialogs.
2. As a signed-in user, I want to see my current plan and its Plan Expiry date, so that I know when my paid plan runs out and when to send a new Manual Payment.
3. As a signed-in user whose plan expired, I want the expired state shown clearly in the plan summary, so that I know nothing auto-renewed and I must pay to continue.
4. As a signed-in user, I want to see my monthly Server Export Quota usage (used vs limit) on the Account page, so that I can budget my Server Exports in the same place I manage my account.
5. As a Pro or Premium user, I want any Comp the Admin granted me reflected in my Quota usage summary, so that my real allowance is visible where I consume it.
6. As a signed-in Free user, I want an upgrade CTA on the Account page, so that I can see what the paid plans offer and start an upgrade.
7. As a user who sent a Manual Payment, I want to see my Orders with their status (pending / verified / rejected), so that I know whether the Admin has verified my payment.
8. As a user with a pending Order, I want a clear "awaiting verification" strip above the list, so that I know the ball is in the Admin's court and I don't submit a duplicate Order.
9. As a user whose Order was rejected, I want to see the reject reason when I expand the Order, so that I know what to fix before submitting again.
10. As a user with several Orders, I want a compact list — Reference Code, date, plan, amount — that expands to show details, so that the page stays scannable.
11. As a Premium user, I want my Export History (30 days of Server Export PDFs) as a section on the Account page, so that my past exports live in the same place as everything else I own.
12. As a Premium user, I want to re-download a PDF from my Export History, so that I can recover a Server Export without regenerating it and spending Quota.
13. As a Pro user, I want the Export History section to show the Premium-only upsell state, so that I know the feature exists, what it does, and how to get it.
14. As a Premium user with an empty history, I want an empty state that explains History keeps Server Export PDFs for 30 days, so that I understand the feature instead of seeing a blank list.
15. As a signed-in user, I want to change my password inline on the Account page (current, new, confirm), so that I don't have to ask the Admin for a temporary password.
16. As a signed-in user, I want inline feedback when my change-password submission fails (wrong current password, too-short new password), so that I can correct it and retry.
17. As a signed-in user, I want clear confirmation when my password changes, so that I know it took effect.
18. As a signed-in user, I want the Account page reachable in one click from the Account menu, so that account management is never more than a click away.
19. As a Free Tier visitor, I want the Account menu to show only **Sign in** when I'm signed out, so that I'm not shown account controls I can't use.
20. As a user on a phone, I want the Account page usable in a single column, so that I can manage my account from the compact shell mode.
21. As a signed-in user, I want to sign out from the Account menu, so that I can end my session from anywhere in the app.

## Implementation Decisions

- New Account page registered at the `/account` route in the existing router; the unknown-path behavior of the router is untouched by this spec.
- The page composes existing endpoints only and makes **no server, API, or schema changes**: account summary from the current `/api/me` response (plan, expiry, Quota), Order list from the existing user Orders endpoint, Export History from the existing History endpoints, password change from the existing change-password endpoint, sign-out from the existing logout endpoint.
- AccountMenu is reduced to **Account** (→ `/account`) and **Sign out**; it shows **Sign in** (→ `/login`) when signed out. The "Upgrade status" and "Export history" entries are removed.
- The Export History dialog's content moves into an Account page section; the Premium gating (including the 403 upsell state and the empty state) moves with it, and the dialog component is deleted.
- Orders list design: compact rows (Reference Code, created date, plan and duration, amount, status badge) that expand in place to coin/network/transaction ID/amounts/reject reason; a single pending strip renders above the list whenever any Order is pending.
- Plan and Quota summary: current plan name, Plan Expiry date with an explicit expired state, Quota used vs limit for the current period including Comps; the Free plan shows an upgrade CTA linking to `/pricing`, where the existing upgrade flow starts.
- Change password: inline section with three fields (current, new, confirm) calling the existing change-password client function; client-side minimum-length validation matching the register policy (8 characters); success and failure feedback rendered inline.
- Page chrome matches the auth pages' minimal header pattern (wordmark linking back to the editor, theme toggle). No footer — the Account page is an app surface, not a marketing surface.
- After sign-out the existing behavior is kept (return to the editor).

## Testing Decisions

- Component tests with a mocked account store and mocked History/Orders clients, colocated with the page (prior art: the existing shell component tests such as the WelcomeStrip test). Only external behavior is asserted: what renders for each plan state (Free / Pro / Premium / expired), each Order status, the pending strip, the History gating states (Premium / upsell / empty), the change-password form calling the existing client function with the right arguments, and the menu's signed-in vs signed-out states — never internal implementation details.
- No new server tests: the spec changes nothing server-side, and the existing route tests already cover change-password, Orders, History, and `/api/me` behavior.
- No e2e for this spec: exercising `/account` end-to-end would require the e2e harness to boot the API server and seed entitlements via the admin API — a new seam, deliberately out of scope. The e2e suite stays the rendered-page smoke seam it is today.
- Good test: renders the user-visible state for each input combination and asserts user-visible feedback; does not assert internal wiring.

## Out of Scope

- Email verification, OAuth, magic links, and forgot-password-by-email — the Admin's temporary-password reset remains the account-recovery path.
- Auto-renewal or any payment gateway — Manual Payment with crypto and Admin Verification is unchanged (ADR-0005).
- Any server, API, or schema change.
- The Admin panel — unchanged.
- Extending the e2e harness to run the API server.

## Further Notes

- The **Docs** menu item is added to the AccountMenu by the `docs-page` spec, not this one.
- The **Account** term is now defined in the project glossary (`CONTEXT.md`), distinct from the account-less Free Tier and from the local Library.
- This spec is independent of `launch-chrome` and `docs-page`; it can be implemented in any order.
