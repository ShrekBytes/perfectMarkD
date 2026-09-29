// ─────────────────────────────────────────────────────────────────────────────
// Which release of the app is running: the version, plus the short commit
// that tells two builds of one version apart.
//
// The number is the `version` field in the repo-root package.json, which CI
// reads and stamps in at build time: the web bundle gets it as the inlined
// VITE_APP_VERSION/VITE_APP_COMMIT, the server image as the APP_VERSION/
// APP_COMMIT build args. Each host passes its own stamp record — the web
// maps its Vite env onto the keys here, the server passes process.env.
// Nothing parses a git tag at runtime: a deployment serves a static bundle
// or an image, and it knows what it is.
//
// `dev`/`local` is what a build that had nothing stamped in reports (`pnpm
// dev`, a hand-built image), rather than a guess at a version.
// ─────────────────────────────────────────────────────────────────────────────

interface BuildInfo {
  version: string;
  commit: string;
}

export function buildInfo(
  source: Record<string, string | undefined>,
): BuildInfo {
  return {
    version: source.APP_VERSION?.trim() || 'dev',
    commit: source.APP_COMMIT?.trim() || 'local',
  };
}
