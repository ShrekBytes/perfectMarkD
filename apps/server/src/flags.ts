// ─────────────────────────────────────────────────────────────────────────────
// Gated-feature flags (billing/04): which paid features are open for a plan.
// GET /api/me reports them, and the web app's Inspector gates read them — so
// the operator's server decides what a paid plan unlocks and the client never
// hardcodes the plan→feature mapping (billing/spec.md: "Client-side unlocking
// via entitlement-aware feature flags").
//
// The gated Inspector controls are exactly five (billing/spec.md §Gated
// features): custom page size, custom stylesheet, header/footer banner
// images, background image, custom fonts — and both paid plans include all of
// them, so the five flags can only ever move together and one boolean carries
// them all. A comped user without a plan (billing/03) spends comps on Server
// Export but gains no features — the gate is the plan itself, not the
// allowance.
// ─────────────────────────────────────────────────────────────────────────────

export interface FeatureFlags {
  /** Every gated Inspector control is open (an active paid Entitlement). */
  paidTier: boolean;
}

/** The flags for a caller's active plan; locked without one. */
export function featureFlagsFor(plan: string | null): FeatureFlags {
  return { paidTier: plan === 'pro' || plan === 'premium' };
}
