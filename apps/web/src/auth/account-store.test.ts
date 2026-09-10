import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';
import { resetAccountStoreForTests, useAccountStore } from './account-store';

afterEach(() => {
  resetAccountStoreForTests();
  vi.restoreAllMocks();
});

describe('account store', () => {
  it('loads the session user once and deduplicates concurrent loads', async () => {
    const me = vi.spyOn(api, 'me').mockResolvedValue({
      email: 'a@b.co',
      isAdmin: false,
    });

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

  it('a failed check means "not signed in", never a thrown error', async () => {
    vi.spyOn(api, 'me').mockRejectedValue(new Error('offline'));

    await useAccountStore.getState().load();

    expect(useAccountStore.getState()).toMatchObject({
      user: null,
      status: 'ready',
    });
  });

  it('signs out — clearing the user even if the request hiccups', async () => {
    useAccountStore.setState({
      user: { email: 'a@b.co', isAdmin: false },
      status: 'ready',
    });
    vi.spyOn(api, 'logout').mockRejectedValue(new Error('offline'));

    await useAccountStore.getState().signOut();

    expect(useAccountStore.getState().user).toBeNull();
  });
});
