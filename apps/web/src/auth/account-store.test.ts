import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';
import type { MePayload } from './api';
import { resetAccountStoreForTests, useAccountStore } from './account-store';

afterEach(() => {
  resetAccountStoreForTests();
  vi.restoreAllMocks();
});

function mePayload(overrides: Partial<MePayload> = {}): MePayload {
  return {
    email: 'a@b.co',
    isAdmin: false,
    plan: null,
    expiresAt: null,
    quota: { used: 0, limit: 0 },
    ...overrides,
  };
}

describe('account store', () => {
  it('loads the session once and deduplicates concurrent loads', async () => {
    const me = vi.spyOn(api, 'me').mockResolvedValue(mePayload());

    await Promise.all([
      useAccountStore.getState().load(),
      useAccountStore.getState().load(),
    ]);

    expect(me).toHaveBeenCalledTimes(1);
    expect(useAccountStore.getState()).toMatchObject({
      user: { email: 'a@b.co' },
      status: 'ready',
    });
  });

  it('splits /api/me into the identity and the entitlement slices', async () => {
    vi.spyOn(api, 'me').mockResolvedValue(
      mePayload({
        plan: 'pro',
        expiresAt: '2026-10-01T00:00:00.000Z',
        quota: { used: 3, limit: 300 },
      }),
    );

    await useAccountStore.getState().load();

    expect(useAccountStore.getState().user).toEqual({
      email: 'a@b.co',
      isAdmin: false,
    });
    expect(useAccountStore.getState().entitlement).toEqual({
      plan: 'pro',
      expiresAt: '2026-10-01T00:00:00.000Z',
      quota: { used: 3, limit: 300 },
    });
  });

  it('a free user has no entitlement slice', async () => {
    vi.spyOn(api, 'me').mockResolvedValue(mePayload());

    await useAccountStore.getState().load();

    expect(useAccountStore.getState().entitlement).toBeNull();
    expect(useAccountStore.getState().user).toEqual({
      email: 'a@b.co',
      isAdmin: false,
    });
  });

  it('a failed check means "not signed in", never a thrown error', async () => {
    vi.spyOn(api, 'me').mockRejectedValue(new Error('offline'));

    await useAccountStore.getState().load();

    expect(useAccountStore.getState()).toMatchObject({
      user: null,
      status: 'ready',
    });
  });

  it('refresh re-checks even after the first load', async () => {
    const me = vi
      .spyOn(api, 'me')
      .mockResolvedValueOnce(mePayload())
      .mockResolvedValue(
        mePayload({
          plan: 'premium',
          expiresAt: '2026-12-01T00:00:00.000Z',
          quota: { used: 9, limit: 1000 },
        }),
      );

    await useAccountStore.getState().load();
    await useAccountStore.getState().refresh();

    expect(me).toHaveBeenCalledTimes(2);
    expect(useAccountStore.getState().entitlement).toMatchObject({
      plan: 'premium',
      quota: { used: 9, limit: 1000 },
    });
  });

  it('a failed refresh keeps the signed-in user on screen', async () => {
    vi.spyOn(api, 'me')
      .mockResolvedValueOnce(mePayload())
      .mockRejectedValue(new Error('offline'));

    await useAccountStore.getState().load();
    await useAccountStore.getState().refresh();

    expect(useAccountStore.getState().status).toBe('ready');
    expect(useAccountStore.getState().user).toEqual({
      email: 'a@b.co',
      isAdmin: false,
    });
  });

  it('signing in refreshes the gates in the background', async () => {
    const me = vi.spyOn(api, 'me').mockResolvedValue(
      mePayload({
        plan: 'pro',
        expiresAt: '2026-10-01T00:00:00.000Z',
        quota: { used: 1, limit: 300 },
      }),
    );

    useAccountStore.getState().signedIn({ email: 'a@b.co', isAdmin: false });
    await vi.waitFor(() => {
      expect(useAccountStore.getState().entitlement).not.toBeNull();
    });

    expect(me).toHaveBeenCalled();
    expect(useAccountStore.getState().user).toEqual({
      email: 'a@b.co',
      isAdmin: false,
    });
  });

  it('signs out — clearing the user and entitlement even if the request hiccups', async () => {
    useAccountStore.setState({
      user: { email: 'a@b.co', isAdmin: false },
      entitlement: {
        plan: 'pro',
        expiresAt: '2026-10-01T00:00:00.000Z',
        quota: { used: 1, limit: 300 },
      },
      status: 'ready',
    });
    vi.spyOn(api, 'logout').mockRejectedValue(new Error('offline'));

    await useAccountStore.getState().signOut();

    expect(useAccountStore.getState().user).toBeNull();
    expect(useAccountStore.getState().entitlement).toBeNull();
  });
});
