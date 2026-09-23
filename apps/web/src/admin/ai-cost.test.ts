import { describe, expect, it } from 'vitest';
import { aiActionCost, formatActionCost } from './ai-cost';

describe('aiActionCost', () => {
  const caps = { maxInputCharacters: 60_000, maxOutputTokens: 16_000 };

  it('converts the input cap through the shared, script-aware estimator', () => {
    // 60,000 characters at the tighter ratio: the worst case the panel states.
    expect(aiActionCost(caps, null).inputTokens).toBe(30_000);
    expect(aiActionCost(caps, null).outputTokens).toBe(16_000);
  });

  it('prices a full input cap plus the whole output cap at the published rates', () => {
    // 30k input at $0.15/M = $0.0045; 16k output at $0.60/M = $0.0096.
    const cost = aiActionCost(caps, {
      inputPricePerMillion: 0.15,
      outputPricePerMillion: 0.6,
    });
    expect(cost.usd).toBeCloseTo(0.0045 + 0.0096, 10);
  });

  it('leaves the price unknown unless both rates are published', () => {
    expect(
      aiActionCost(caps, {
        inputPricePerMillion: 0.15,
        outputPricePerMillion: null,
      }).usd,
    ).toBeNull();
    expect(
      aiActionCost(caps, {
        inputPricePerMillion: null,
        outputPricePerMillion: 0.6,
      }).usd,
    ).toBeNull();
    expect(aiActionCost(caps, null).usd).toBeNull();
  });

  it('is zero for zero caps, not a NaN or a negative', () => {
    const cost = aiActionCost(
      { maxInputCharacters: 0, maxOutputTokens: 0 },
      { inputPricePerMillion: 3, outputPricePerMillion: 15 },
    );
    expect(cost.inputTokens).toBe(0);
    expect(cost.usd).toBe(0);
  });
});

describe('formatActionCost', () => {
  it('keeps cheap models distinguishable', () => {
    expect(formatActionCost(0.0005)).toBe('$0.00050');
    expect(formatActionCost(0.005)).toBe('$0.0050');
  });

  it('shows four decimals for ordinary costs and handles zero', () => {
    expect(formatActionCost(0.0141)).toBe('$0.0141');
    expect(formatActionCost(0.135)).toBe('$0.1350');
    expect(formatActionCost(0)).toBe('$0');
  });
});
