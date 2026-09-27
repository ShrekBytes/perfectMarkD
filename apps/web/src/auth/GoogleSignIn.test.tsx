// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { GoogleSignIn } from './GoogleSignIn';
import * as api from './api';

function advertisement(google: boolean) {
  return vi.spyOn(api, 'signInProviders').mockResolvedValue({ google });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('offers a plain link to the start endpoint when the server advertises the feature', async () => {
  const providers = advertisement(true);

  render(<GoogleSignIn failure={null} />);

  // The response is a redirect to Google's consent screen, so the browser has
  // to follow it: the router's Link (which would swallow the click) is wrong.
  const button = await screen.findByRole('link', {
    name: /continue with google/i,
  });
  // The root path, not /api: the callback URI is registered with Google, so the
  // server mounts the flow at /auth/google and both proxies pass it through.
  expect(button).toHaveAttribute('href', '/auth/google/start');
  expect(providers).toHaveBeenCalled();
});

it('renders no button at all on a deployment that has not configured it', async () => {
  // Story 8: absent, never broken. The check is the only thing that decides it.
  advertisement(false);

  render(<GoogleSignIn failure={null} />);

  await vi.waitFor(() => expect(api.signInProviders).toHaveBeenCalledTimes(1));
  expect(
    screen.queryByRole('link', { name: /continue with google/i }),
  ).not.toBeInTheDocument();
  expect(screen.queryByTestId('google-sign-in')).not.toBeInTheDocument();
});

it('renders nothing while the check is still in flight', () => {
  // No flash: a button that appears and then vanishes on an unconfigured
  // instance is worse than one that never arrives.
  vi.spyOn(api, 'signInProviders').mockReturnValue(new Promise(() => {}));

  render(<GoogleSignIn failure={null} />);

  expect(
    screen.queryByRole('link', { name: /continue with google/i }),
  ).not.toBeInTheDocument();
});

it('renders nothing when the check itself fails and no callback is being reported', async () => {
  vi.spyOn(api, 'signInProviders').mockRejectedValue(new Error('offline'));

  render(<GoogleSignIn failure={null} />);

  await vi.waitFor(() => expect(api.signInProviders).toHaveBeenCalledTimes(1));
  expect(
    screen.queryByRole('link', { name: /continue with google/i }),
  ).not.toBeInTheDocument();
  expect(screen.queryByTestId('google-sign-in')).not.toBeInTheDocument();
});

it.each([
  ['declined', /closed the consent screen/i],
  ['error', /didn’t finish/i],
  ['rate_limited', /too many google sign-in attempts/i],
] as const)(
  'explains a %s callback inline, beside the retry',
  async (code, said) => {
    advertisement(true);

    render(<GoogleSignIn failure={code} />);

    const notice = await screen.findByTestId('google-sign-in-failure');
    expect(notice).toHaveTextContent(said);
    // Announced when it lands, and the recovery is still one click away.
    expect(notice).toHaveAttribute('role', 'alert');
    expect(notice).toHaveTextContent(/or sign in with your password/i);
    expect(
      screen.getByRole('link', { name: /continue with google/i }),
    ).toBeInTheDocument();
  },
);

it('still explains a failed callback when the advertisement never arrived', async () => {
  // The case the notice is not the button's to carry: Google's leg failed over
  // the same bad connection the check is riding, so a user who chose Google and
  // got nothing is told why (story 9) rather than shown a page as if nothing
  // happened.
  vi.spyOn(api, 'signInProviders').mockRejectedValue(new Error('offline'));

  render(<GoogleSignIn failure="error" />);

  expect(await screen.findByTestId('google-sign-in-failure')).toHaveTextContent(
    /didn’t finish/i,
  );
  // No button to retry with — the check is what would have drawn it.
  expect(
    screen.queryByRole('link', { name: /continue with google/i }),
  ).not.toBeInTheDocument();
});
