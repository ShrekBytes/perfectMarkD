// ─────────────────────────────────────────────────────────────────────────────
// Order amounts are decimal strings, never floats: they must round-trip
// exactly what the user was shown and what the Admin compares against the
// on-chain transaction. Amounts are denominated in the Order's coin — USDT
// orders in USDT, LTC orders in LTC — with the LTC rate captured alongside.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_DECIMALS = 8;

/**
 * Shortest exact decimal string for an order amount, capped at 8 fractional
 * digits (LTC's on-chain precision): 9 → "9", 9.5 → "9.5", 42/320.5 →
 * "0.13107956".
 */
export function toCryptoAmount(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`amount is not finite: ${value}`);
  }
  const fixed = value.toFixed(MAX_DECIMALS);
  return fixed.includes('.')
    ? fixed.replace(/0+$/, '').replace(/\.$/, '')
    : fixed;
}

/**
 * The LTC amount to show for a USDT total, at the captured rate. Rounded
 * (never padded) to 8 decimals — the user sends this amount, so it is what
 * the Admin expects to see on-chain.
 */
export function ltcAmountFor(amountUsdt: number, usdtPerLtc: number): string {
  if (usdtPerLtc <= 0) {
    throw new Error(`LTC rate must be positive: ${usdtPerLtc}`);
  }
  return toCryptoAmount(amountUsdt / usdtPerLtc);
}
