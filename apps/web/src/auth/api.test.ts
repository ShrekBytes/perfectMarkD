import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AuthError,
  changePassword,
  login,
  logout,
  me,
  register,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  verifyEmail,
} from './api';

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
  it('POSTs the credentials and returns the address a link went to', async () => {
    // No user and no session: the account cannot be used until its address is
    // verified (email/02), so the response carries the address to wait for.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ email: 'a@b.co' }, 201));
    vi.stubGlobal('fetch', fetchMock);

    const sent = await register('a@b.co', 'correct horse battery');

    expect(sent).toEqual({ email: 'a@b.co' });
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

describe('the verification link', () => {
  it('asks for a fresh link, and reports the server message on refusal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ sent: true }));
    vi.stubGlobal('fetch', fetchMock);

    await resendVerification('a@b.co');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/auth/resend-verification');
    expect(init).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ email: 'a@b.co' }),
    });

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: 'Too many attempts. Try again shortly.' }, 429),
        ),
    );
    await expect(resendVerification('a@b.co')).rejects.toThrow(
      new AuthError('Too many attempts. Try again shortly.', 429),
    );
  });

  it('spends a token and returns the user it signed in', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ user: { email: 'a@b.co', isAdmin: false } }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const user = await verifyEmail('t0ken');

    expect(user).toEqual({ email: 'a@b.co', isAdmin: false });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/auth/verify-email');
    expect(init).toMatchObject({ body: JSON.stringify({ token: 't0ken' }) });
  });
});

describe('Password Reset', () => {
  it('asks for a link, and reports the server message on refusal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ sent: true }));
    vi.stubGlobal('fetch', fetchMock);

    await requestPasswordReset('a@b.co');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/auth/request-password-reset');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ email: 'a@b.co' }),
    });

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: 'Too many attempts. Try again shortly.' }, 429),
        ),
    );
    await expect(requestPasswordReset('a@b.co')).rejects.toThrow(
      new AuthError('Too many attempts. Try again shortly.', 429),
    );
  });

  it('sends the link’s token with the new password and resolves on 204', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await resetPassword('t0ken', 'a brand new password');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/auth/reset-password');
    expect(init).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        token: 't0ken',
        newPassword: 'a brand new password',
      }),
    });
  });

  it('surfaces a dead link with the code the page branches on', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: 'That link is no longer valid.',
            code: 'link_invalid',
          },
          400,
        ),
      ),
    );

    await expect(
      resetPassword('t0ken', 'a brand new password'),
    ).rejects.toThrow(
      new AuthError('That link is no longer valid.', 400, 'link_invalid'),
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
