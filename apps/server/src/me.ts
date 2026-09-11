// ─────────────────────────────────────────────────────────────────────────────
// GET /api/me (server/04 + billing/04) — the signed-in user's identity and
// gates: who they are, their active Entitlement, where they stand against the
// monthly Server Export quota, and which gated features their plan opens. The
// single source of truth the web app's account store consumes: the quota chip
// and the gated Inspector controls all read from this one payload.
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono';
import type { AppEnv } from './index.js';
import type { Clock } from './auth/sessions.js';
import { featureFlagsFor } from './flags.js';
import { getPlanLimits } from './db/settings.js';
import { findActiveEntitlement, quotaState } from './quota.js';

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
    // plan/expiresAt describe the ACTIVE Entitlement only: an expired row
    // reports both null, so the client re-locks without a second endpoint
    // (spec §Entitlement rules). The lapse date, if a future notice needs
    // it, lives in the user's Order history.
    const activeEntitlement = findActiveEntitlement(db, user.id, nowDate);
    const state = quotaState(
      db,
      user.id,
      activeEntitlement,
      getPlanLimits(db),
      nowDate,
    );
    return c.json({
      email: user.email,
      isAdmin: user.isAdmin,
      plan: activeEntitlement?.plan ?? null,
      expiresAt: activeEntitlement?.expiresAt.toISOString() ?? null,
      quota: { used: state.used, limit: state.limit },
      // The gated Inspector controls (billing/04): open exactly while an
      // Entitlement is active — the same condition as plan/expiresAt above.
      flags: featureFlagsFor(activeEntitlement?.plan ?? null),
    });
  });

  return app;
}
