import { expect, it } from 'vitest';
import { normalizeMarkdown } from '@perfectmarkd/core';

it('web resolves the workspace dependency on packages/core', () => {
  expect(normalizeMarkdown('a\r\nb')).toBe('a\nb');
});
