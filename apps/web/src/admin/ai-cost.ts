// ─────────────────────────────────────────────────────────────────────────────
// The worst-case arithmetic behind one AI Action (spec §AI Provider Config),
// shown in the Admin's AI Provider Config panel so a pricey model is a visible
// decision rather than a surprise. The input cap is converted through the
// shared estimator (the same conservative, script-aware one the size ladder
// uses) and the output cap is taken as configured; the pair is priced at the
// model's published rates when Test connection reports them.
//
// Pure and free of the DOM: the panel renders these numbers, and the tests
// assert the arithmetic rather than the pixels.
// ─────────────────────────────────────────────────────────────────────────────

import { estimateTokensForCharacters } from '@perfectmarkd/core';

/** The published per-million-token rates, or null when the provider did not
 *  report them. */
export interface AiActionPrices {
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
}

/** One AI Action's worst case: the input cap fully used, plus the whole output
 *  cap. Both token figures are estimates. */
export interface AiActionCost {
  /** The conservative token equivalent of a full input cap. */
  inputTokens: number;
  /** The configured output cap, as sent with every request. */
  outputTokens: number;
  /** Worst-case USD for one AI Action, or null when the price is unknown. */
  usd: number | null;
}

/**
 * The worst case for one AI Action, from the caps being edited and the prices
 * Test connection reported. The price is null unless both rates are published:
 * a half-known price is not a price the Admin can plan around.
 */
export function aiActionCost(
  caps: { maxInputCharacters: number; maxOutputTokens: number },
  prices: AiActionPrices | null,
): AiActionCost {
  const inputTokens = estimateTokensForCharacters(caps.maxInputCharacters);
  const outputTokens = caps.maxOutputTokens;
  const inputPrice = prices?.inputPricePerMillion ?? null;
  const outputPrice = prices?.outputPricePerMillion ?? null;
  const usd =
    inputPrice === null || outputPrice === null
      ? null
      : (inputTokens * inputPrice + outputTokens * outputPrice) / 1_000_000;
  return { inputTokens, outputTokens, usd };
}

/**
 * A per-Action price with enough precision to stay meaningful for a cheap
 * model: four decimal places for an ordinary cost, and two significant
 * figures below a cent, so $0.005 and $0.0005 are told apart.
 */
export function formatActionCost(usd: number): string {
  if (usd === 0) return '$0';
  if (usd >= 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toPrecision(2)}`;
}
