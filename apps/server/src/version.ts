/**
 * Which release of the app is running: the version, plus the short commit that
 * tells two builds of one version apart.
 *
 * The number is the `version` field in the repo-root package.json, which CI
 * reads and passes in as the APP_VERSION/APP_COMMIT build args — a deployment
 * pulls an image, and the image knows what it is. Nothing here parses a git tag
 * at runtime.
 *
 * `dev`/`local` is what a build that had nothing stamped in reports (`pnpm dev`,
 * a hand-built image), rather than a guess at a version.
 */
interface BuildInfo {
  version: string;
  commit: string;
}

export function buildInfo(
  source: Record<string, string | undefined> = process.env,
): BuildInfo {
  return {
    version: source.APP_VERSION?.trim() || 'dev',
    commit: source.APP_COMMIT?.trim() || 'local',
  };
}
