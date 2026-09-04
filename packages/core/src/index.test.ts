import { expect, it } from 'vitest';
import { hello } from './index';

it('greets by name', () => {
  expect(hello('PerfectMarkD')).toBe('Hello, PerfectMarkD!');
});
