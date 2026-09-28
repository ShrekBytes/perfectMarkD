import { Hono } from 'hono';
import type { AppEnv } from '../index.js';
import { getPlanLimits, getPlanPrices } from '../db/settings.js';
import type { PlanLimits, PlanPrices } from '../db/schema.js';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pricing (live-pricing/01): the stored plan prices and plan limits,
// so the Admin panel's Settings is the one place a price or a limit lives and
// a customer reads the numbers the Order will actually be created from.
//
// Deliberately unauthenticated and deliberately small. A prospective customer
// on /pricing is not signed in, so the read cannot require a session; and
// because it needs no session there is nothing in it derived from a user. It is
// also deliberately NOT the whole settings view: the wallet addresses are not
// published (they are the instance's receiving addresses, and this response is
// public), and neither is the LTC Rate. The Rate is not a catalog number at
// all — it is a per-Order quote, snapshotted onto the Order when it is created
// and shown to the customer in the payment phase where they are paying. A Rate
// published here would be a public figure going stale between writes.
//
// The response is public, so it must not be cached: a cached price is the exact
// stale-quote failure this endpoint exists to remove.
// ─────────────────────────────────────────────────────────────────────────────

/** The public view of the plan catalog's numbers. */
export interface PricingView {
  prices: PlanPrices;
  limits: PlanLimits;
}

export function pricingRoutes() {
  const app = new Hono<AppEnv>();

  app.get('/', (c) => {
    c.header('cache-control', 'no-store');
    const db = c.var.db;
    return c.json({ prices: getPlanPrices(db), limits: getPlanLimits(db) });
  });

  return app;
}
