// ─────────────────────────────────────────────────────────────────────────────
// The three receiving methods (ADR-0005) and their coin/network decomposition.
// `USDT-TRC20` and friends are payment-method keys in the `wallets` setting;
// the Order itself stores the coin and network separately.
// ─────────────────────────────────────────────────────────────────────────────

import type { Coin, Network, PaymentMethod } from '../db/schema.js';

export const METHOD_COIN_NETWORK: Record<
  PaymentMethod,
  { coin: Coin; network: Network }
> = {
  'USDT-TRC20': { coin: 'USDT', network: 'TRC20' },
  'USDT-BEP20': { coin: 'USDT', network: 'BEP20' },
  LTC: { coin: 'LTC', network: 'mainnet' },
};

const METHOD_BY_KEY = new Map<string, PaymentMethod>(
  Object.entries(METHOD_COIN_NETWORK).map(([method, { coin, network }]) => [
    `${coin}:${network}`,
    method as PaymentMethod,
  ]),
);

/** The payment method a stored coin/network pair corresponds to. */
export function methodForCoinNetwork(
  coin: string,
  network: string,
): PaymentMethod | null {
  return METHOD_BY_KEY.get(`${coin}:${network}`) ?? null;
}

/** TRON, BSC, and Litecoin transaction ids are 64 hex characters. */
export const TXID_PATTERN = /^[0-9a-f]{64}$/i;

const NETWORKS_BY_COIN: Record<Coin, readonly Network[]> = {
  USDT: ['TRC20', 'BEP20'],
  LTC: ['mainnet'],
};

/**
 * Whether a network can carry a given coin — an LTC order cannot be
 * "submitted on TRC-20". Used when amending an Order's submission details.
 */
export function networkValidForCoin(coin: string, network: string): boolean {
  return (NETWORKS_BY_COIN[coin as Coin] ?? []).includes(network as Network);
}

/** The human-readable list of networks an Order's coin can be sent on. */
export function networkListForCoin(coin: string): string {
  return (NETWORKS_BY_COIN[coin as Coin] ?? [])
    .map((network) =>
      network === 'mainnet'
        ? 'the Litecoin mainnet'
        : network === 'TRC20'
          ? 'TRC-20'
          : 'BEP-20',
    )
    .join(' or ');
}
