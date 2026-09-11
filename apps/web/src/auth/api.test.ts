import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthError, changePassword, login, logout, me, register } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('register', () => {
  it('POSTs the credentials to /api/auth/register and returns the user', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ user: { email: 'a@b.co', isAdmin: false } }, 201),
      );
    vi.stubGlobal('fetch', fetchMock);

    const user = await register('a@b.co', 'correct horse battery');

    expect(user).toEqual({ email: 'a@b.co', isAdmin: false });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/auth/register');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'a@b.co',
        password: 'correct horse battery',
      }),
    });
  });

  it('throws an AuthError carrying the server message and status', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: 'That email is already registered.' }, 409),
        ),
    );

    await expect(register('a@b.co', 'correct horse battery')).rejects.toThrow(
      new AuthError('That email is already registered.', 409),
    );
  });
});

describe('login', () => {
  it('returns the user on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ user: { email: 'a@b.co', isAdmin: true } }),
        ),
    );

    expect(await login('a@b.co', 'correct horse battery')).toEqual({
      email: 'a@b.co',
      isAdmin: true,
    });
  });

  it('throws AuthError on invalid credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: 'Incorrect email or password.' }, 401),
        ),
    );

    await expect(login('a@b.co', 'nope')).rejects.toBeInstanceOf(AuthError);
  });
});

describe('logout', () => {
  it('POSTs to /api/auth/logout', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await logout();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/auth/logout');
    expect(init).toMatchObject({ method: 'POST' });
  });
});

describe('me', () => {
  it('GETs /api/me and returns the identity + gates payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        email: 'a@b.co',
        isAdmin: false,
        plan: 'pro',
        expiresAt: '2026-10-01T00:00:00.000Z',
        quota: { used: 3, limit: 300 },
        flags: {
          customPageSize: true,
          customStylesheet: true,
          bannerImages: true,
          backgroundImage: true,
          customFonts: true,
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const meUser = await me();

    expect(meUser).toEqual({
      email: 'a@b.co',
      isAdmin: false,
      plan: 'pro',
      expiresAt: '2026-10-01T00:00:00.000Z',
      quota: { used: 3, limit: 300 },
      flags: {
        customPageSize: true,
        customStylesheet: true,
        bannerImages: true,
        backgroundImage: true,
        customFonts: true,
      },
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/me');
    expect(init).toMatchObject({ credentials: 'include' });
  });

  it('returns null when not signed in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: 'Not signed in.' }, 401)),
    );

    expect(await me()).toBeNull();
  });
});

describe('changePassword', () => {
  it('POSTs both passwords and resolves on 204', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await changePassword('old password', 'new password');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/auth/change-password');
    expect(JSON.parse(String(init?.body))).toEqual({
      currentPassword: 'old password',
      newPassword: 'new password',
    });
  });

  it('surfaces the server error for a wrong current password', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: 'Current password is incorrect.' }, 401),
        ),
    );

    await expect(changePassword('bad', 'new password')).rejects.toThrow(
      'Current password is incorrect.',
    );
  });
});
