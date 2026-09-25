// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The wrapper's whole job is deciding whether and when to talk to the
 * tracker, so these tests drive the two facts it reads (the instance's
 * analytics config, which Caddy serves at runtime, and the build's tracker
 * URL) and the two it waits for (the script, then `window.umami`) rather than
 * any real Umami code.
 */

/** A fresh module instance under the given runtime config and tracker URL. */
async function loadTracker(websiteId?: string, url?: string) {
  vi.resetModules();
  if (websiteId === undefined) delete window.__ANALYTICS_WEBSITE_ID__;
  else window.__ANALYTICS_WEBSITE_ID__ = websiteId;
  vi.stubEnv('VITE_ANALYTICS_URL', url ?? '');
  return import('./tracker');
}

function trackerScript(): HTMLScriptElement | null {
  return document.querySelector('script[data-website-id]');
}

/** Stands in for the tracker script executing: the global appears, then load fires. */
function arrive(track = vi.fn()) {
  window.umami = { track };
  trackerScript()?.dispatchEvent(new Event('load'));
  return track;
}

beforeEach(() => {
  document.head.innerHTML = '';
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
  delete window.__ANALYTICS_WEBSITE_ID__;
  delete window.umami;
});

describe('an instance without a website id', () => {
  it('loads nothing and sends nothing', async () => {
    const { initAnalytics, trackEvent, trackPageView } = await loadTracker();
    const appended = vi.spyOn(document.head, 'appendChild');

    initAnalytics();
    trackPageView('/pricing');
    trackEvent('client-export');

    // Nothing is sent because there is nothing to send through: the tracker
    // script is this module's only outbound path, and it is never requested.
    // Asserting the absent script alone would leave "sends nothing" implied
    // by the implementation rather than observed here.
    expect(appended).not.toHaveBeenCalled();
    expect(window.umami).toBeUndefined();
  });

  it('treats a blank id as no id at all', async () => {
    const { initAnalytics, trackEvent } = await loadTracker('   ');

    initAnalytics();
    trackEvent('client-export');

    expect(trackerScript()).toBeNull();
  });
});

describe('an instance with a website id', () => {
  it('loads the self-hosted tracker once, configured for this app', async () => {
    const { initAnalytics } = await loadTracker(
      'e676c9b4-11e4-4ef1-a4d7-87001773e9f2',
    );

    initAnalytics();
    initAnalytics();

    const scripts = document.querySelectorAll('script[data-website-id]');
    expect(scripts).toHaveLength(1);
    const script = scripts[0] as HTMLScriptElement;
    expect(script.src).toBe('http://localhost:3000/analytics/script.js');
    expect(script.dataset.websiteId).toBe(
      'e676c9b4-11e4-4ef1-a4d7-87001773e9f2',
    );
    // Page views are the router's (see trackPageView), and the tracker must
    // not collect more than the app asks it to.
    expect(script.dataset.autoPageview).toBe('false');
    expect(script.dataset.doNotTrack).toBe('true');
    expect(script.dataset.excludeSearch).toBe('true');
  });

  it('reads the id when it initializes, not when the module loads', async () => {
    const { initAnalytics } = await loadTracker();
    // The config script is deferred, so the value can land after this module
    // is evaluated; what matters is that it is there before the first track.
    window.__ANALYTICS_WEBSITE_ID__ = 'id';

    initAnalytics();

    expect(trackerScript()?.dataset.websiteId).toBe('id');
  });

  it('trims a trailing slash off the configured base', async () => {
    const { initAnalytics } = await loadTracker('id', '/stats/');

    initAnalytics();

    expect(trackerScript()?.src).toBe('http://localhost:3000/stats/script.js');
  });

  it('holds calls until the tracker lands, then delivers them in order', async () => {
    const { initAnalytics, trackEvent, trackPageView } =
      await loadTracker('id');

    initAnalytics();
    trackPageView('/');
    trackEvent('upgrade-modal-open');

    // Nothing to send through yet — the script has not executed.
    const track = vi.fn();
    window.umami = { track };
    expect(track).not.toHaveBeenCalled();

    trackerScript()?.dispatchEvent(new Event('load'));

    expect(track).toHaveBeenCalledTimes(2);
    const [pageview] = track.mock.calls[0] as [
      (props: Record<string, unknown>) => Record<string, unknown>,
    ];
    expect(pageview({ website: 'id', title: 'PerfectMarkD' })).toEqual({
      website: 'id',
      title: 'PerfectMarkD',
      url: '/',
    });
    expect(track.mock.calls[1]).toEqual(['upgrade-modal-open']);
  });

  it('sends events with their data straight through once loaded', async () => {
    const { initAnalytics, trackEvent } = await loadTracker('id');

    initAnalytics();
    const track = arrive();

    trackEvent('plan-select', { plan: 'pro' });
    trackEvent('server-export');

    expect(track.mock.calls).toEqual([
      ['plan-select', { plan: 'pro' }],
      ['server-export'],
    ]);
  });

  it('stops queueing once the queue is full, so a blocked script cannot grow it', async () => {
    const { initAnalytics, trackEvent } = await loadTracker('id');

    initAnalytics();
    for (let i = 0; i < 25; i += 1) trackEvent('client-export');

    const track = arrive();

    expect(track).toHaveBeenCalledTimes(20);
  });

  it('drains the queue harmlessly when the script loads with nothing to call', async () => {
    const { initAnalytics, trackEvent } = await loadTracker('id');

    initAnalytics();
    trackEvent('client-export');

    // `window.umami` still absent when load fires — the script ran but left
    // nothing behind. The queue drains without throwing.
    expect(() =>
      trackerScript()?.dispatchEvent(new Event('load')),
    ).not.toThrow();
  });
});
