// ─────────────────────────────────────────────────────────────────────────────
// Gated-feature flags (billing/04): which paid features are open for a plan.
// GET /api/me reports them, and the web app's Inspector gates read them — so
// the operator's server decides what a paid plan unlocks and the client never
// hardcodes the plan→feature mapping (billing/spec.md: "Client-side unlocking
// via entitlement-aware feature flags").
//
// The five flags are exactly the gated Inspector controls (billing/spec.md
// §Gated features): custom page size, custom stylesheet, header/footer banner
// images, background image, custom fonts. Both paid plans include all of them.
// A comped user without a plan (billing/03) spends comps on Server Export but
// gains no features — the gate is the plan itself, not the allowance.
// ─────────────────────────────────────────────────────────────────────────────

export interface FeatureFlags {
  customPageSize: boolean;
  customStylesheet: boolean;
  bannerImages: boolean;
  backgroundImage: boolean;
  customFonts: boolean;
}

/** The flags for a caller's active plan; every flag locked without one. */
export function featureFlagsFor(plan: string | null): FeatureFlags {
  const open = plan === 'pro' || plan === 'premium';
  return {
    customPageSize: open,
    customStylesheet: open,
    bannerImages: open,
    backgroundImage: open,
    customFonts: open,
  };
}
