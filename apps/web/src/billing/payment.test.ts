import { describe, expect, it } from 'vitest';
import {
  isValidTxid,
  NETWORK_LABELS,
  networkWarning,
  PAYMENT_METHODS,
} from './payment';

// The canonical sets, hand-copied from apps/server/src/db/schema.ts (NETWORKS
// and the Coin/PaymentMethod unions). The web owns no copy of them — these
// assertions are the drift check: a network or coin added server-side must
// arrive here too, or the payment instructions go unlabelled for it.
const SERVER_NETWORKS = ['TRC20', 'BEP20', 'mainnet'];

describe('payment methods', () => {
  it('mirrors the server’s canonical set', () => {
    expect(PAYMENT_METHODS).toEqual(['USDT-TRC20', 'USDT-BEP20', 'LTC']);
  });

  it('labels every network the server can route', () => {
    expect(Object.keys(NETWORK_LABELS).sort()).toEqual(
      [...SERVER_NETWORKS].sort(),
    );
  });
});

describe('isValidTxid', () => {
  it('accepts 64 hex characters, any case, trimmed', () => {
    expect(isValidTxid('a'.repeat(64))).toBe(true);
    expect(isValidTxid(`${'A'.repeat(63)}f`)).toBe(true);
    expect(isValidTxid(`  ${'0'.repeat(64)}  `)).toBe(true);
  });

  it('rejects anything that is not a 64-character hex string', () => {
    expect(isValidTxid('abc')).toBe(false);
    expect(isValidTxid('z'.repeat(64))).toBe(false);
    expect(isValidTxid(`${'a'.repeat(65)}`)).toBe(false);
    expect(isValidTxid('')).toBe(false);
  });
});

describe('networkWarning', () => {
  it('names the exact coin and network for each method', () => {
    expect(networkWarning('TRC20')).toMatch(/^Send only USDT on TRC-20/);
    expect(networkWarning('BEP20')).toMatch(/^Send only USDT on BEP-20/);
    expect(networkWarning('mainnet')).toMatch(/^Send only LTC/);
  });

  it('warns that money on the wrong network is lost', () => {
    expect(networkWarning('TRC20')).toMatch(/cannot be recovered/);
    expect(networkWarning('mainnet')).toMatch(/cannot be recovered/);
  });
});
