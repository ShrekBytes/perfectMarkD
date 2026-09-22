import { Link } from '../router';
import { GITHUB_URL, LICENSE_URL, PLUGIN_URL } from './site-links';

const plainLink =
  'touch-target transition-colors duration-150 outline-offset-2 outline-accent hover:text-ink focus-visible:outline-2';

/**
 * The shared footer for the site's non-editor surfaces: pricing, About,
 * Privacy, Docs, and the 404. It carries the pricing page's original
 * colophon — the AGPL badge, GitHub, and the plugin-successor link — plus
 * links to the static surfaces, so any of them can reach the others. The
 * editor and the auth pages render no footer: the drop-in experience stays
 * uncluttered.
 */
export function Footer() {
  return (
    <footer className="flex flex-wrap items-center gap-3 border-t border-hairline bg-surface px-4 py-4 text-xs text-ink-soft">
      <a
        href={LICENSE_URL}
        className="touch-target rounded-control border border-hairline bg-canvas px-2 py-0.5 font-medium text-ink transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover focus-visible:outline-2"
      >
        AGPL-3.0
      </a>
      <a href={GITHUB_URL} className={plainLink}>
        GitHub
      </a>
      <Link to="/pricing" className={plainLink}>
        Pricing
      </Link>
      <Link to="/docs" className={plainLink}>
        Docs
      </Link>
      <Link to="/about" className={plainLink}>
        About
      </Link>
      <Link to="/privacy" className={plainLink}>
        Privacy
      </Link>
      <a href={PLUGIN_URL} className={`${plainLink} ml-auto`}>
        Successor to the Advanced PDF Export plugin
      </a>
    </footer>
  );
}
