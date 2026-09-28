// ─────────────────────────────────────────────────────────────────────────────
// The gated-feature flags (billing/04): the client's mirror of the `flags`
// field GET /api/me reports (apps/server/src/flags.ts owns the derivation).
//
// The feature-flag store is the account store's `flags` slice — /api/me is the
// single source of truth for the gates, and the account store is its mirror,
// so a separate store here would only duplicate it (and could drift). Reading
// the flags is `useFeatureFlags()` from ../auth/account-store.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The gate every gated Inspector control reads: custom page size, custom
 * stylesheet, header/footer banner images, background image, custom fonts.
 * The server reports one boolean because the five can only move together —
 * both paid plans include all of them (billing/spec.md §Gated features).
 */
export interface FeatureFlags {
  paidTier: boolean;
}

/**
 * Every gate locked — the default before /api/me answers, and the standing
 * state for signed-out and Free users: they never gain gates.
 */
export const LOCKED_FLAGS: FeatureFlags = { paidTier: false };

/** Every gate open — what an active Pro/Premium Entitlement reports. */
export const OPEN_FLAGS: FeatureFlags = { paidTier: true };
