// This instance's Umami website id, served to the app at runtime (launch/11).
//
// This file is the *default* copy: a dev server, `vite preview`, and the e2e
// bundle all serve it, and it carries no id — so analytics stays off, which is
// what those environments want. The shipped deployment never serves this
// copy: Caddy answers this exact path from the deployment's
// ANALYTICS_WEBSITE_ID (see the `handle /analytics-config.js` block in the
// Caddyfile), so one published image collects for an instance that sets an id
// and for none that does not.
//
// What a deployment's response looks like:
//   window.__ANALYTICS_WEBSITE_ID__ = "<uuid>";
window.__ANALYTICS_WEBSITE_ID__ = '';
