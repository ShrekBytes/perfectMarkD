# billing — Manual crypto billing + gated features (Phase 2)

Implements the Manual Payment → Order → Verification → Entitlement flow (ADR-0005) and unlocks the paid features that Phase 1 shipped as inert locks.

## Flow (canonical)

1. User picks plan + duration on `/pricing` or the pricing modal → prompted to register/login if needed.
2. Order created: Reference Code (short, e.g. `PM-7F3K2`), exact amount (USDT-denominated; LTC amount computed from a rate captured at Order creation and shown alongside), wallet addresses per coin from admin settings, network warnings (send on the chosen network only).
3. User sends crypto, then submits: network, txid, amount, optional note.
4. Order sits `pending` — user sees it in an "Upgrade status" view.
5. Admin verifies on-chain in `/admin` → Entitlement granted with chosen expiry (preset durations or custom date) → user's gates open, quota chip appears.
6. Reject → reason recorded; user sees it and can resubmit with corrected details (new submission amends the same Order).

## Entitlement rules

- One active Entitlement per user (`plan`, `expires_at`). Verify while active → extends from current expiry (stacking durations), not from verification date.
- Expired → gates re-lock, quota stops; history rows age out naturally. No auto-renew, no dunning — the app shows expiry dates plainly.

## Gated features (both plans)

Custom page size · custom stylesheet · header/footer banner images · background image · custom fonts (bundled catalog stays free). Client-side unlocking via entitlement-aware feature flags; enforcement of the valuable parts (Server Export, quota, history) is server-side.
