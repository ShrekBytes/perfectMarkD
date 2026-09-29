// ─────────────────────────────────────────────────────────────────────────────
// The Rate's exchange seam (live-pricing/02).
//
// One number in, one USDT-per-LTC figure out: the last traded rate on a
// public, keyless ticker. The request carries no credential and nothing about
// the instance or its users — it is a rate query, which is why the Privacy page
// names it (ADR-0014).
//
// The seam is resolved in the composition root the way the AI provider and the
// identity exchange are, so nothing outside this file learns the endpoint and
// the refresh job's tests run against a fake. Every transport, HTTP, and shape
// failure becomes the shared UpstreamError, so the job records a reason
// without knowing the wire.
// ─────────────────────────────────────────────────────────────────────────────

import {
  UpstreamError,
  fetchWithTimeout,
  readJson,
} from '../fetch-with-timeout.js';

/** The seam: one fetch, one figure, or a throw. */
export interface LtcRateProvider {
  /** USDT per LTC. Throws `UpstreamError` for every failure. */
  fetchRate(): Promise<number>;
}

interface LtcRateProviderOptions {
  /** Per-request deadline in milliseconds (default 10s). */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/** A handshake that has not answered in this long has failed. */
const TICKER_URL = 'https://api.kraken.com/0/public/Ticker?pair=LTCUSDT';

/**
 * The real feed: Kraken's public ticker for the LTC/USDT pair. Keyless, so
 * there is nothing to configure and nothing to leak, and denominated in USDT
 * directly — the Rate is not a dollar figure converted, so the pair is the
 * pair (ADR-0014).
 */
export function createLtcRateProvider({
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: LtcRateProviderOptions = {}): LtcRateProvider {
  return {
    async fetchRate() {
      return fetchWithTimeout({
        url: TICKER_URL,
        init: { method: 'GET' },
        timeoutMs,
        read: async (response) => {
          if (!response.ok) {
            throw new UpstreamError(
              'http',
              `The rate feed answered with HTTP ${response.status}.`,
            );
          }
          return readLastPrice(
            await readJson(
              response,
              'The rate feed returned a malformed reply.',
            ),
          );
        },
        errors: {
          timeout: () =>
            new UpstreamError(
              'timeout',
              'The rate feed did not answer in time.',
            ),
          transport: () =>
            new UpstreamError(
              'transport',
              'The rate feed could not be reached.',
            ),
        },
      });
    },
  };
}

/**
 * The last closed trade, as a positive number. Kraken keys the result by the
 * pair it recognised, which is not always the pair that was asked for, so the
 * first ticker in `result` is read rather than a hard-coded name. Anything
 * that is not a positive number here is a bad quote, not a bad figure: it is
 * refused, and the Rate the instance already has is kept.
 */
function readLastPrice(payload: unknown): number {
  const malformed = (): never => {
    throw new UpstreamError(
      'invalid_response',
      'The rate feed returned no usable rate.',
    );
  };
  if (typeof payload !== 'object' || payload === null) return malformed();
  const { error, result } = payload as { error?: unknown; result?: unknown };
  // An error array is Kraken's own shape for "no", and it can arrive with a
  // 200. It is a provider fault, never a rate of zero.
  if (Array.isArray(error) && error.length > 0) {
    throw new UpstreamError(
      'invalid_response',
      'The rate feed reported an error instead of a rate.',
    );
  }
  if (typeof result !== 'object' || result === null) return malformed();
  const ticker = Object.values(result as Record<string, unknown>).find(
    (value) => typeof value === 'object' && value !== null,
  );
  if (typeof ticker !== 'object' || ticker === null) return malformed();
  const { c } = ticker as { c?: unknown };
  if (!Array.isArray(c) || c.length === 0) return malformed();
  const rate = Number(c[0]);
  return Number.isFinite(rate) && rate > 0 ? rate : malformed();
}
