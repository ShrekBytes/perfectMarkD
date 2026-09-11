// ─────────────────────────────────────────────────────────────────────────────
// The gated-feature flags (billing/04): the client's mirror of the `flags`
// field GET /api/me reports (apps/server/src/flags.ts owns the derivation).
//
// The feature-flag store is the account store's `flags` slice — /api/me is the
// single source of truth for the gates, and the account store is its mirror,
// so a separate store here would only duplicate it (and could drift). Reading
// the flags is `useFeatureFlags()` from ../auth/account-store.
// ─────────────────────────────────────────────────────────────────────────────

/** The five gated Inspector controls (billing/spec.md §Gated features). */
export interface FeatureFlags {
  customPageSize: boolean;
  customStylesheet: boolean;
  bannerImages: boolean;
  backgroundImage: boolean;
  customFonts: boolean;
}

/**
 * Every gate locked — the default before /api/me answers, and the standing
 * state for signed-out and Free users: they never gain gates.
 */
export const LOCKED_FLAGS: FeatureFlags = {
  customPageSize: false,
  customStylesheet: false,
  bannerImages: false,
  backgroundImage: false,
  customFonts: false,
};

/** Every gate open — what an active Pro/Premium Entitlement reports. */
export const OPEN_FLAGS: FeatureFlags = {
  customPageSize: true,
  customStylesheet: true,
  bannerImages: true,
  backgroundImage: true,
  customFonts: true,
};
