import { describe, expect, it } from 'vitest';
import type { AssetResolver } from './assets';

describe('AssetResolver', () => {
  it('is satisfiable by a ref-mapping function', () => {
    const dataOnly: AssetResolver = (ref) =>
      ref.startsWith('data:') ? ref : undefined;

    expect(dataOnly('data:image/png;base64,AAA')).toBe(
      'data:image/png;base64,AAA',
    );
    expect(dataOnly('./img/cat.png')).toBeUndefined();
  });
});
