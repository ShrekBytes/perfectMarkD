// ─────────────────────────────────────────────────────────────────────────────
// The pricing numbers the catalog surfaces share (live-pricing/01): one store
// so /pricing, the pricing modal, and the purchase flow cannot disagree about a
// price, and so the fetch happens once however many of them are mounted.
//
// There is no cached fallback. `status` is 'unavailable' when the read fails
// and the surfaces say so in as many words, because a quietly wrong price read
// as current is the exact failure this store exists to remove. The Admin panel
// is the one place a price lives (apps/server/src/db/settings.ts), so there is
// nothing here to fall back to.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react';
import { create } from 'zustand';
import { getPricing, type PlanLimits, type PlanPrices } from './api';

export type PricingStatus = 'loading' | 'ready' | 'unavailable';

interface PricingState {
  prices: PlanPrices | null;
  limits: PlanLimits | null;
  status: PricingStatus;
  /** Reads the numbers once; safe to call from several mounts. */
  load: () => Promise<void>;
}

let inflight: Promise<void> | null = null;

export const usePricingStore = create<PricingState>()((set) => ({
  prices: null,
  limits: null,
  status: 'loading',
  load: () => {
    // Once read, nothing to re-read: a second request would only risk a
    // second paint of a price that has not changed. A *failed* read does retry
    // on the next mount, so a visitor who hits a blip and reopens the pricing
    // modal gets the numbers rather than a pinned outage.
    if (usePricingStore.getState().status === 'ready') {
      return Promise.resolve();
    }
    inflight ??= getPricing()
      .then(({ prices, limits }) => set({ prices, limits, status: 'ready' }))
      .catch(() => set({ prices: null, limits: null, status: 'unavailable' }))
      .finally(() => {
        inflight = null;
      });
    return inflight;
  },
}));

/**
 * The numbers for a pricing surface, and the fetch that fills them. Plan
 * identity and feature labels come from the catalog and render on first paint;
 * the numbers arrive here afterwards.
 */
export function usePricing() {
  const state = usePricingStore();
  useEffect(() => {
    void usePricingStore.getState().load();
  }, []);
  return state;
}

export function resetPricingStoreForTests(): void {
  inflight = null;
  usePricingStore.setState({ prices: null, limits: null, status: 'loading' });
}
