import { expect, it } from 'vitest';
import { hello } from '@perfectmarkd/core';

it('web resolves the workspace dependency on packages/core', () => {
  expect(hello('web')).toBe('Hello, web!');
});
