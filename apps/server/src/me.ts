// ─────────────────────────────────────────────────────────────────────────────
// GET /api/me (server/04) — the signed-in user's identity and gates: who they
// are, their active Entitlement, and where they stand against the monthly
// Server Export quota. The single source of truth the web app's account store
// consumes for the quota chip; billing/04 extends the payload with feature
// flags for the gated Inspector controls.
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { AppEnv } from './index.js';
import type { Clock } from './auth/sessions.js';
import { entitlements } from './db/schema.js';
import { getPlanLimits } from './db/settings.js';
import { isEntitlementActive, quotaState } from './quota.js';

export interface MeRoutesOptions {
  /** Injectable clock (tests control expiry and the period boundary). */
  now?: Clock;
}

export function meRoutes({ now = () => new Date() }: MeRoutesOptions = {}) {
  const app = new Hono<AppEnv>();

  app.get('/', (c) => {
    const user = c.var.user;
    if (!user) return c.json({ error: 'Not signed in.' }, 401);

    const db = c.var.db;
    const nowDate = now();
    const entitlement = db
      .select()
      .from(entitlements)
      .where(eq(entitlements.userId, user.id))
      .get();
    // Expired → plan null: the client re-locks the paid features without a
    // second endpoint (spec §Entitlement rules).
    const active = isEntitlementActive(entitlement ?? null, nowDate);
    const state = quotaState(
      db,
      user.id,
      entitlement ?? null,
      getPlanLimits(db),
      nowDate,
    );
    return c.json({
      email: user.email,
      isAdmin: user.isAdmin,
      plan: active ? entitlement!.plan : null,
      expiresAt: active ? entitlement!.expiresAt.toISOString() : null,
      quota: { used: state.used, limit: state.limit },
    });
  });

  return app;
}
