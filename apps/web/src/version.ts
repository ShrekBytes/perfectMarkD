/**
 * Which release of the app is running: the version, plus the short commit that
 * tells two builds of one version apart.
 *
 * The number is the `version` field in the repo-root package.json, which CI
 * reads and passes in as VITE_APP_VERSION/VITE_APP_COMMIT — Vite inlines both
 * into the bundle, the same way it inlines VITE_ANALYTICS_URL. Nothing here
 * parses a git tag at runtime: a deployment serves a static bundle, and the
 * bundle knows what it is.
 */
export function buildInfo() {
  return {
    version: import.meta.env.VITE_APP_VERSION?.trim() || 'dev',
    commit: import.meta.env.VITE_APP_COMMIT?.trim() || 'local',
  };
}
