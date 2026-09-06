// Node 26 installs its Web Storage accessors onto every VM context — including
// the one vitest's jsdom environment runs the window in. Under the repo's
// NODE_OPTIONS=--no-webstorage (kept so Node's storage never races jsdom's in
// other setups) that accessor's internal binding is empty, so it permanently
// returns undefined and shadows jsdom's own, perfectly working storage. The
// accessors are configurable, so re-point them at jsdom's backing objects.
// No-op outside a jsdom environment (node-env suites never get a window).

const win = (globalThis as { window?: unknown }).window as
  (Window & { _localStorage?: Storage; _sessionStorage?: Storage }) | undefined;

if (win && '_localStorage' in win) {
  Object.defineProperty(win, 'localStorage', {
    get: () => win._localStorage,
    configurable: true,
  });
  Object.defineProperty(win, 'sessionStorage', {
    get: () => win._sessionStorage,
    configurable: true,
  });

  const globals = globalThis as Record<string, unknown>;
  if (typeof globals.localStorage === 'undefined') {
    Object.defineProperty(globals, 'localStorage', {
      get: () => win.localStorage,
      configurable: true,
    });
  }
  if (typeof globals.sessionStorage === 'undefined') {
    Object.defineProperty(globals, 'sessionStorage', {
      get: () => win.sessionStorage,
      configurable: true,
    });
  }
}
