import { Link } from '../router';
import { PageHeader } from './PageHeader';
import { Footer } from './Footer';
import { GITHUB_URL, PLUGIN_URL } from './site-links';
import { ghostCta, primaryCta } from './buttons';

// The Admin's contact address (launch-chrome spec).
const CONTACT_EMAIL = 'shrebytes@duck.com';

const inlineLink =
  'font-medium text-ink underline decoration-hairline underline-offset-2 transition-colors duration-150 outline-offset-2 outline-accent hover:decoration-ink focus-visible:outline-2';

/**
 * The /about page: small and single-column — what the tool is, the
 * Obsidian-plugin successor story, why AGPL, contact, and the two CTAs.
 * Static content in the SPA (launch-chrome spec). No team page, no blog,
 * no roadmap.
 */
export function AboutPage() {
  return (
    <div className="flex min-h-full flex-col bg-canvas text-ink">
      <PageHeader />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-semibold tracking-tight">
          About PerfectMarkD
        </h1>
        <p className="mt-2 max-w-prose text-sm text-ink-soft">
          Markdown in, print-perfect PDF out — in the browser, with no account
          and nothing to install.
        </p>

        <section aria-label="What PerfectMarkD is" className="mt-8">
          <h2 className="text-base font-semibold tracking-tight">
            What is PerfectMarkD?
          </h2>
          <p className="mt-2 max-w-prose text-sm text-ink-soft">
            A web app that turns Markdown into perfectly laid-out PDFs,
            independent of any note-taking platform. The editor and the paper
            preview sit side by side and reflow as you type, and one rendering
            engine drives both the screen and the print — so what you see is
            exactly the PDF you get. The whole editing experience and Client
            Export (the browser's own print pipeline) are free and unmetered.
          </p>
        </section>

        <section aria-label="Where it comes from" className="mt-6">
          <h2 className="text-base font-semibold tracking-tight">
            Born from an Obsidian plugin
          </h2>
          <p className="mt-2 max-w-prose text-sm text-ink-soft">
            PerfectMarkD is the platform-independent successor to{' '}
            <a href={PLUGIN_URL} className={inlineLink}>
              the Advanced PDF Export plugin
            </a>{' '}
            for Obsidian. The plugin made print-perfect PDFs inside one
            note-taking app; this is that engine, ported and rebuilt for the
            browser, so any Markdown writer can use it — no Obsidian required.
          </p>
        </section>

        <section aria-label="Why AGPL" className="mt-6">
          <h2 className="text-base font-semibold tracking-tight">
            Free software, AGPL-3.0
          </h2>
          <p className="mt-2 max-w-prose text-sm text-ink-soft">
            Everything — editor, rendering engine, and server — is free
            software under AGPL-3.0. You can read the code, audit what it does,
            or run your own instance. The repo lives on{' '}
            <a href={GITHUB_URL} className={inlineLink}>
              GitHub
            </a>
            .
          </p>
        </section>

        <section aria-label="Contact" className="mt-6">
          <h2 className="text-base font-semibold tracking-tight">Contact</h2>
          <p className="mt-2 max-w-prose text-sm text-ink-soft">
            Found a bug or have a question? Open an issue on GitHub, or email{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className={inlineLink}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>

        <section aria-label="Get started" className="mt-10">
          <div className="flex flex-wrap items-center gap-3 rounded-pane border border-hairline bg-surface px-4 py-4">
            <p className="text-sm font-medium">
              Try it now — no account needed.
            </p>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Link to="/" className={primaryCta}>
                Open the editor
              </Link>
              <Link to="/pricing" className={ghostCta}>
                See pricing
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
