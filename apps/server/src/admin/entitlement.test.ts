import { describe, expect, it } from 'vitest';
import { addMonths, expiryForGrant } from './entitlement.js';

describe('addMonths', () => {
  it('adds calendar months in UTC', () => {
    expect(addMonths(new Date('2026-09-11T12:00:00Z'), 3)).toEqual(
      new Date('2026-12-11T12:00:00Z'),
    );
  });

  it('rolls over the year', () => {
    expect(addMonths(new Date('2026-11-20T00:00:00Z'), 3)).toEqual(
      new Date('2027-02-20T00:00:00Z'),
    );
  });

  it('clamps the day when the target month is shorter (Jan 31 + 1mo)', () => {
    expect(addMonths(new Date('2027-01-31T12:00:00Z'), 1)).toEqual(
      new Date('2027-02-28T12:00:00Z'),
    );
  });

  it('clamps onto Feb 29 in a leap year', () => {
    expect(addMonths(new Date('2028-01-31T12:00:00Z'), 1)).toEqual(
      new Date('2028-02-29T12:00:00Z'),
    );
  });

  it('keeps day 31 when the target month has one', () => {
    expect(addMonths(new Date('2027-01-31T12:00:00Z'), 2)).toEqual(
      new Date('2027-03-31T12:00:00Z'),
    );
  });
});

describe('expiryForGrant', () => {
  const now = new Date('2026-09-11T00:00:00Z');

  it('grants from now when there is no current Entitlement', () => {
    expect(expiryForGrant(now, null, 3)).toEqual(
      new Date('2026-12-11T00:00:00Z'),
    );
  });

  it('stacks onto the current expiry while the Entitlement is active', () => {
    expect(expiryForGrant(now, new Date('2026-10-05T00:00:00Z'), 3)).toEqual(
      new Date('2027-01-05T00:00:00Z'),
    );
  });

  it('grants from now once the Entitlement has expired', () => {
    expect(expiryForGrant(now, new Date('2026-09-10T23:59:59Z'), 12)).toEqual(
      new Date('2027-09-11T00:00:00Z'),
    );
  });

  it('treats an Entitlement expiring exactly now as expired', () => {
    expect(expiryForGrant(now, now, 1)).toEqual(
      new Date('2026-10-11T00:00:00Z'),
    );
  });
});
