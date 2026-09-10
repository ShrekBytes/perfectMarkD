import { describe, expect, it } from 'vitest';
import {
  isValidTxid,
  NETWORKS,
  networkWarning,
  PAYMENT_METHODS,
} from './payment';

describe('payment methods and networks', () => {
  it('mirrors the server’s canonical sets', () => {
    expect(PAYMENT_METHODS).toEqual(['USDT-TRC20', 'USDT-BEP20', 'LTC']);
    expect(NETWORKS).toEqual(['TRC20', 'BEP20', 'mainnet']);
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
