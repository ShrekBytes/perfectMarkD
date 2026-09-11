import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';
import type { MePayload } from './api';
import { LOCKED_FLAGS, OPEN_FLAGS } from './flags';
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
    flags: LOCKED_FLAGS,
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

  it('splits /api/me into the identity, entitlement, quota, and flag slices', async () => {
    vi.spyOn(api, 'me').mockResolvedValue(
      mePayload({
        plan: 'pro',
        expiresAt: '2026-10-01T00:00:00.000Z',
        quota: { used: 3, limit: 300 },
        flags: OPEN_FLAGS,
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
    });
    // Quota is account state, not entitlement state: comps grant allowance
    // without a plan (billing/03), so the top-level slice survives both.
    expect(useAccountStore.getState().quota).toEqual({ used: 3, limit: 300 });
    expect(useAccountStore.getState().flags).toEqual(OPEN_FLAGS);
  });

  it('a free user has no entitlement slice and no quota', async () => {
    vi.spyOn(api, 'me').mockResolvedValue(mePayload());

    await useAccountStore.getState().load();

    expect(useAccountStore.getState().entitlement).toBeNull();
    expect(useAccountStore.getState().quota).toEqual({ used: 0, limit: 0 });
    expect(useAccountStore.getState().flags).toEqual(LOCKED_FLAGS);
    expect(useAccountStore.getState().user).toEqual({
      email: 'a@b.co',
      isAdmin: false,
    });
  });

  it('a comped user without a plan keeps their allowance, flags locked', async () => {
    // billing/03: comps grant Server Exports without a plan — the quota
    // slice stands while entitlement is null (billing/04).
    vi.spyOn(api, 'me').mockResolvedValue(
      mePayload({ quota: { used: 2, limit: 5 } }),
    );

    await useAccountStore.getState().load();

    expect(useAccountStore.getState().entitlement).toBeNull();
    expect(useAccountStore.getState().quota).toEqual({ used: 2, limit: 5 });
    expect(useAccountStore.getState().flags).toEqual(LOCKED_FLAGS);
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
          flags: OPEN_FLAGS,
        }),
      );

    await useAccountStore.getState().load();
    await useAccountStore.getState().refresh();

    expect(me).toHaveBeenCalledTimes(2);
    expect(useAccountStore.getState().entitlement).toMatchObject({
      plan: 'premium',
    });
    expect(useAccountStore.getState().quota).toEqual({ used: 9, limit: 1000 });
    expect(useAccountStore.getState().flags).toEqual(OPEN_FLAGS);
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
        flags: OPEN_FLAGS,
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
    // billing/04 acceptance: gates open within one me refresh.
    expect(useAccountStore.getState().flags).toEqual(OPEN_FLAGS);
  });

  describe('plan-ended notice', () => {
    it('a refresh that re-locks an active entitlement raises the notice', async () => {
      vi.spyOn(api, 'me')
        .mockResolvedValueOnce(
          mePayload({
            plan: 'pro',
            expiresAt: '2026-10-01T00:00:00.000Z',
            quota: { used: 0, limit: 300 },
            flags: OPEN_FLAGS,
          }),
        )
        .mockResolvedValue(mePayload());

      await useAccountStore.getState().load();
      await useAccountStore.getState().refresh();

      // Graceful re-lock: gates close, and the shell gets its clear notice.
      expect(useAccountStore.getState().entitlement).toBeNull();
      expect(useAccountStore.getState().flags).toEqual(LOCKED_FLAGS);
      expect(useAccountStore.getState().planEndedNotice).toBe(true);
      expect(useAccountStore.getState().user).not.toBeNull();
    });

    it('dismissing clears the notice', async () => {
      useAccountStore.setState({ planEndedNotice: true });

      useAccountStore.getState().dismissPlanEndedNotice();

      expect(useAccountStore.getState().planEndedNotice).toBe(false);
    });

    it('no notice when there was nothing to lose', async () => {
      vi.spyOn(api, 'me').mockResolvedValue(mePayload());

      await useAccountStore.getState().load();

      expect(useAccountStore.getState().planEndedNotice).toBe(false);
    });

    it('no notice when a refresh finds a new plan (extension, not a lapse)', async () => {
      vi.spyOn(api, 'me')
        .mockResolvedValueOnce(
          mePayload({
            plan: 'pro',
            expiresAt: '2026-10-01T00:00:00.000Z',
            quota: { used: 0, limit: 300 },
            flags: OPEN_FLAGS,
          }),
        )
        .mockResolvedValue(
          mePayload({
            plan: 'premium',
            expiresAt: '2027-10-01T00:00:00.000Z',
            quota: { used: 0, limit: 1000 },
            flags: OPEN_FLAGS,
          }),
        );

      await useAccountStore.getState().load();
      await useAccountStore.getState().refresh();

      expect(useAccountStore.getState().planEndedNotice).toBe(false);
    });

    it('a failed refresh neither re-locks nor raises the notice', async () => {
      vi.spyOn(api, 'me')
        .mockResolvedValueOnce(
          mePayload({
            plan: 'pro',
            expiresAt: '2026-10-01T00:00:00.000Z',
            quota: { used: 0, limit: 300 },
            flags: OPEN_FLAGS,
          }),
        )
        .mockRejectedValue(new Error('offline'));

      await useAccountStore.getState().load();
      await useAccountStore.getState().refresh();

      expect(useAccountStore.getState().entitlement).not.toBeNull();
      expect(useAccountStore.getState().planEndedNotice).toBe(false);
    });
  });

  it('signs out — clearing identity, entitlement, quota, and flags even if the request hiccups', async () => {
    useAccountStore.setState({
      user: { email: 'a@b.co', isAdmin: false },
      entitlement: { plan: 'pro', expiresAt: '2026-10-01T00:00:00.000Z' },
      quota: { used: 1, limit: 300 },
      flags: OPEN_FLAGS,
      planEndedNotice: true,
      status: 'ready',
    });
    vi.spyOn(api, 'logout').mockRejectedValue(new Error('offline'));

    await useAccountStore.getState().signOut();

    expect(useAccountStore.getState().user).toBeNull();
    expect(useAccountStore.getState().entitlement).toBeNull();
    expect(useAccountStore.getState().quota).toBeNull();
    // Logged-out users never gain gates (billing/04).
    expect(useAccountStore.getState().flags).toEqual(LOCKED_FLAGS);
    expect(useAccountStore.getState().planEndedNotice).toBe(false);
  });
});
