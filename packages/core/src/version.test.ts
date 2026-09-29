import { describe, expect, it } from 'vitest';
import { buildInfo } from './version.js';

/**
 * Both values are stamped in at build time, so the only thing to test is what
 * the module does with the record a host passes — including with nothing
 * found, which is what a dev build and a hand-built image get.
 */
describe('buildInfo', () => {
  it('reports the version and commit stamped in at build time', () => {
    expect(buildInfo({ APP_VERSION: '0.1.0', APP_COMMIT: 'abc1234' })).toEqual({
      version: '0.1.0',
      commit: 'abc1234',
    });
  });

  it('falls back to dev/local when nothing was stamped in', () => {
    expect(buildInfo({})).toEqual({ version: 'dev', commit: 'local' });
  });

  it('treats a blank stamp as no stamp', () => {
    expect(buildInfo({ APP_VERSION: '  ', APP_COMMIT: '' })).toEqual({
      version: 'dev',
      commit: 'local',
    });
  });
});
