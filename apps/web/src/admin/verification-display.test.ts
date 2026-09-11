import { describe, expect, it } from 'vitest';
import {
  amountsMatch,
  explorerUrl,
  previewExpiry,
} from './verification-display';

const TXID = '9f2c7a01b4e5d6f8a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0';

describe('explorerUrl', () => {
  it('deep-links TRC-20 txids into Tronscan', () => {
    expect(explorerUrl('TRC20', TXID)).toBe(
      `https://tronscan.org/#/transaction/${TXID}`,
    );
  });

  it('deep-links BEP-20 txids into BscScan', () => {
    expect(explorerUrl('BEP20', TXID)).toBe(`https://bscscan.com/tx/${TXID}`);
  });

  it('deep-links Litecoin txids into Blockchair', () => {
    expect(explorerUrl('mainnet', TXID)).toBe(
      `https://blockchair.com/litecoin/transaction/${TXID}`,
    );
  });
});

describe('amountsMatch', () => {
  it('accepts the same amount in different decimal notations', () => {
    expect(amountsMatch('9', '9.00000000')).toBe(true);
  });

  it('flags a claimed amount that differs from the expected one', () => {
    expect(amountsMatch('9', '3')).toBe(false);
  });

  it('flags an underpayment at the last decimal', () => {
    expect(amountsMatch('9', '8.99999999')).toBe(false);
  });

  it('never matches a missing claim', () => {
    expect(amountsMatch('9', null)).toBe(false);
  });
});

describe('previewExpiry', () => {
  const now = new Date('2026-09-11T00:00:00.000Z');

  it('adds the duration to now when there is no current Entitlement', () => {
    expect(previewExpiry(null, 3, now)).toBe('2026-12-11');
  });

  it('stacks onto the current expiry while it is still active', () => {
    expect(previewExpiry('2026-10-05T00:00:00.000Z', 3, now)).toBe(
      '2027-01-05',
    );
  });

  it('adds the duration to now once the Entitlement has expired', () => {
    expect(previewExpiry('2026-09-01T00:00:00.000Z', 1, now)).toBe(
      '2026-10-11',
    );
  });

  it('clamps month-end overflow (Jan 31 + 1 month → Feb 28)', () => {
    expect(previewExpiry('2027-01-31T00:00:00.000Z', 1, now)).toBe(
      '2027-02-28',
    );
  });
});
