// ─────────────────────────────────────────────────────────────────────────────
// GET /api/me (server/04 + billing/04 + ai-transforms/03) — the signed-in
// user's identity and gates: who they are, their active Entitlement, where
// they stand against the monthly Server Export quota, the instance's and the
// caller's AI state, which gated features their plan opens, and which sign-in
// methods the account has. The single source of truth the web app's account
// store consumes: the quota chip, the gated Inspector controls, the Account
// page's password section, and every AI surface read from this one payload.
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import type { AppEnv } from './index.js';
import type { Clock } from './auth/sessions.js';
import { featureFlagsFor } from './flags.js';
import { getAiProviderConfig, getPlanLimits } from './db/settings.js';
import { findActiveEntitlement, quotaState } from './quota.js';
import { aiAccountState } from './ai/state.js';
import { identities, GOOGLE_PROVIDER } from './db/schema.js';
import type { AiContext } from './ai/context.js';

export interface MeRoutesOptions {
  /** Injectable clock (tests control expiry and the period boundary). */
  now?: Clock;
  /** The AI context: environment key presence and the provider seam. */
  ai?: AiContext;
}

export function meRoutes({ now = () => new Date(), ai }: MeRoutesOptions = {}) {
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
    const limits = getPlanLimits(db);
    const state = quotaState(db, user.id, activeEntitlement, limits, nowDate);
    return c.json({
      email: user.email,
      isAdmin: user.isAdmin,
      plan: activeEntitlement?.plan ?? null,
      expiresAt: activeEntitlement?.expiresAt.toISOString() ?? null,
      quota: { used: state.used, limit: state.limit },
      // The gated Inspector controls (billing/04): open exactly while an
      // Entitlement is active — the same condition as plan/expiresAt above.
      flags: featureFlagsFor(activeEntitlement?.plan ?? null),
      // Which sign-in methods (CONTEXT.md) this account has (google-signin/01b).
      // A password of its own is a non-empty hash — that is all a Google
      // registration stores — and a Google identity is an `identities` row. The
      // Account page renders the form this reports and never guesses: an
      // account with a password gets Change Password, one without gets the
      // section that sets its first.
      signIn: {
        password: user.passwordHash !== '',
        google: Boolean(
          db
            .select({ subject: identities.subject })
            .from(identities)
            .where(
              and(
                eq(identities.userId, user.id),
                eq(identities.provider, GOOGLE_PROVIDER),
              ),
            )
            .get(),
        ),
      },
      // The AI state (ai-transforms/03): configured is the instance's kill
      // switch plus key; included is the caller's plan; access is the caller's
      // own switch. Every AI surface reads this block rather than guessing.
      ai: aiAccountState({
        db,
        userId: user.id,
        apiKey: ai?.apiKey ?? null,
        access: user.aiAccess,
        disclosureSeen: user.aiDisclosureSeen,
        entitlement: activeEntitlement,
        limits,
        config: getAiProviderConfig(db),
        now: nowDate,
      }),
    });
  });

  return app;
}
