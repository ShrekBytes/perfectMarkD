import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Both values are inlined at build time, so the only thing to test is what the
 * module does with what it finds — including with nothing found, which is what
 * a dev build and a hand-built image get.
 */

/** A fresh module instance with the given build stamp. */
async function loadVersion(version?: string, commit?: string) {
  vi.resetModules();
  vi.stubEnv('VITE_APP_VERSION', version ?? '');
  vi.stubEnv('VITE_APP_COMMIT', commit ?? '');
  return import('./version');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('buildInfo', () => {
  it('reports the version and commit the build stamped in', async () => {
    const { buildInfo } = await loadVersion('0.1.0', 'abc1234');
    expect(buildInfo()).toEqual({ version: '0.1.0', commit: 'abc1234' });
  });

  it('falls back to dev/local when the build stamped nothing in', async () => {
    const { buildInfo } = await loadVersion();
    expect(buildInfo()).toEqual({ version: 'dev', commit: 'local' });
  });

  it('treats a blank stamp as no stamp', async () => {
    const { buildInfo } = await loadVersion('  ', '');
    expect(buildInfo()).toEqual({ version: 'dev', commit: 'local' });
  });
});
