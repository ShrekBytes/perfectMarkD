/**
 * The app's only door to Umami (launch/01).
 *
 * Analytics is self-hosted and same-origin: the tracker script is served from
 * `/analytics` on this origin, so a page load still talks to nobody else. A
 * build has no analytics at all unless `VITE_ANALYTICS_WEBSITE_ID` is set —
 * that is how a self-hosted instance without Umami runs, and it is why every
 * entry point here is a no-op in tests and in development.
 *
 * Page views come from the router, not from the tracker: this app routes
 * through the History API itself, so one explicit call per route change is
 * exactly one page view, with no path-change detection to double-count it
 * (`data-auto-pageview="false"`).
 *
 * The event vocabulary is a union in this module, so a call site can only pass
 * a name that exists here — the names are greppable from one file, and no
 * `data-` attributes are sprinkled over the markup to do the same job.
 */

export type AnalyticsEvent =
  'client-export' | 'server-export' | 'upgrade-modal-open' | 'plan-select';

/** Event data. Umami caps strings at 500 characters and objects at 50 keys. */
export type AnalyticsData = Record<string, string | number | boolean>;

type TrackerProps = Record<string, unknown>;

/** The slice of the Umami tracker this app calls. */
interface UmamiTracker {
  /** A page view for the current document. */
  track(props: (props: TrackerProps) => TrackerProps): void;
  /** A named event, with optional data. */
  track(name: string, data?: AnalyticsData): void;
}

declare global {
  interface Window {
    umami?: UmamiTracker;
  }
}

/** Where the tracker script and its collect endpoint live. */
const TRACKER_BASE = (
  import.meta.env.VITE_ANALYTICS_URL || '/analytics'
).replace(/\/+$/, '');

/** The Umami website this build reports to; empty means no analytics at all. */
const WEBSITE_ID: string | undefined =
  import.meta.env.VITE_ANALYTICS_WEBSITE_ID || undefined;

/** Enough to cover the page views before the script lands, and no more. */
const MAX_QUEUED = 20;

let scriptRequested = false;
let queued: Array<() => void> = [];

/**
 * Sends through the tracker, or holds the call until the script arrives. A
 * call is dropped outright when this build has no analytics, and the queue is
 * capped so a tracker that never loads (blocked, offline) can't grow it
 * without bound.
 */
function whenReady(send: (umami: UmamiTracker) => void): void {
  const umami = window.umami;
  if (umami) {
    send(umami);
    return;
  }
  if (!scriptRequested || queued.length >= MAX_QUEUED) return;
  queued.push(() => {
    if (window.umami) send(window.umami);
  });
}

function flushQueue(): void {
  const pending = queued;
  queued = [];
  for (const send of pending) send();
}

/**
 * Loads the tracker, once, on the first tracked page. A no-op when this build
 * has no website id.
 */
export function initAnalytics(): void {
  if (scriptRequested || !WEBSITE_ID) return;
  scriptRequested = true;

  const script = document.createElement('script');
  script.defer = true;
  script.src = `${TRACKER_BASE}/script.js`;
  script.dataset.websiteId = WEBSITE_ID;
  // The router owns page views (see trackPageView), Do Not Track is honoured,
  // and query strings are dropped so nothing a visitor typed can end up in a
  // URL we record.
  script.dataset.autoPageview = 'false';
  script.dataset.doNotTrack = 'true';
  script.dataset.excludeSearch = 'true';
  script.addEventListener('load', flushQueue);
  document.head.appendChild(script);
}

/**
 * One page view for `path`. Called on every route change — with the tracker's
 * own path-change detection off, this is the only source of page views.
 */
export function trackPageView(path: string): void {
  whenReady((umami) => umami.track((props) => ({ ...props, url: path })));
}

/** A named, anonymous event. `data` never carries anything personal. */
export function trackEvent(event: AnalyticsEvent, data?: AnalyticsData): void {
  whenReady((umami) => {
    if (data) umami.track(event, data);
    else umami.track(event);
  });
}
