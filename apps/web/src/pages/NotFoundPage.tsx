import { Link } from '../router';
import { PageHeader } from './PageHeader';
import { Footer } from './Footer';
import { primaryCta } from './buttons';

/**
 * The 404 page for unknown paths (launch-chrome spec): minimal, with a
 * working link back to the editor, so a mistyped address reads as intentional
 * rather than broken.
 */
export function NotFoundPage() {
  return (
    <div className="flex min-h-full flex-col bg-canvas text-ink">
      <PageHeader />

      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-pane border border-hairline bg-surface p-6 text-center">
          <p
            className="font-mono text-xs font-medium uppercase tracking-[0.025em] text-ink-faint"
            aria-hidden="true"
          >
            404
          </p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">
            Page not found
          </h1>
          <p className="mt-1 text-xs text-ink-soft">
            This address doesn't exist — it may have been mistyped or moved.
          </p>
          <div className="mt-5 flex justify-center">
            <Link to="/" className={primaryCta}>
              Open the editor
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
