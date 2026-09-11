// ─────────────────────────────────────────────────────────────────────────────
// Display vocabulary for the billing surfaces — the upgrade flow, the user's
// Upgrade status view, and the admin panel (billing/01, billing/02). Mirrors
// the server's canonical sets — apps/server/src/db/schema.ts owns the truth;
// this module only labels and validates it for display.
// ─────────────────────────────────────────────────────────────────────────────

import type { Coin, Network, OrderStatus, PaymentMethod } from './api';

/** The `YYYY-MM-DD` an Order list shows for created/decided timestamps. */
export function orderDate(iso: string): string {
  return iso.slice(0, 10);
}

export const PAYMENT_METHODS = ['USDT-TRC20', 'USDT-BEP20', 'LTC'] as const;
export { type PaymentMethod };

export const NETWORKS = ['TRC20', 'BEP20', 'mainnet'] as const;
export { type Network };

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  'USDT-TRC20': 'USDT · TRC-20',
  'USDT-BEP20': 'USDT · BEP-20',
  LTC: 'Litecoin · LTC',
};

export const NETWORK_LABELS: Record<Network, string> = {
  TRC20: 'TRC-20',
  BEP20: 'BEP-20',
  mainnet: 'Litecoin mainnet',
};

/** The networks that can carry a coin — an LTC order can't go out on TRC-20. */
export function networksForCoin(coin: Coin): Network[] {
  return coin === 'LTC' ? ['mainnet'] : ['TRC20', 'BEP20'];
}

/** The warning the instructions view must show for the chosen network. */
export function networkWarning(network: Network): string {
  if (network === 'mainnet') {
    return 'Send only LTC on the Litecoin mainnet to this address — funds sent anywhere else cannot be recovered.';
  }
  return `Send only USDT on ${NETWORK_LABELS[network]} to this address — funds sent on any other network cannot be recovered.`;
}

/** TRON, BSC, and Litecoin transaction ids are 64 hex characters. */
export function isValidTxid(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value.trim());
}

// ─────────────────────────────────────────────────────────────────────────────
// Order-status display vocabulary, shared by the user's Upgrade status view
// and the admin queue (billing/02) so both surfaces label states alike.
// ─────────────────────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending',
  verified: 'Verified',
  rejected: 'Rejected',
};

export const STATUS_BADGE: Record<OrderStatus, string> = {
  pending: 'border-hairline bg-canvas text-ink-soft',
  verified: 'border-accent/40 bg-accent-soft text-accent',
  rejected: 'border-danger/30 bg-danger/10 text-danger',
};
