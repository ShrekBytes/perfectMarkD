import { expect, it } from 'vitest';
import { PAGE_SIZES } from '@perfectmarkd/core';

it('web resolves the workspace dependency on packages/core', () => {
  expect(PAGE_SIZES.A4).toEqual({ w: 794, h: 1123 });
});
