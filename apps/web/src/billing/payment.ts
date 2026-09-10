// ─────────────────────────────────────────────────────────────────────────────
// Payment-method vocabulary for the upgrade UI (ADR-0005). Mirrors the
// server's canonical sets — apps/server/src/db/schema.ts owns the truth; this
// module only labels and validates it for display.
// ─────────────────────────────────────────────────────────────────────────────

import type { Coin, Network, PaymentMethod } from './api';

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
