import { useEffect, useState } from 'react';
import { loadDocsContent, type DocsContent } from '../docs/docs-content';
import { PageHeader } from './PageHeader';
import { Footer } from './Footer';

const navLink =
  'touch-target block rounded-control px-2 py-1.5 text-sm text-ink-soft transition-colors duration-150 outline-offset-2 outline-accent hover:bg-surface-hover hover:text-ink focus-visible:outline-2';

/**
 * The /docs page (docs-page spec): one long scrolling page rendered from a
 * single markdown source through the engine's markdown renderer — plain web
 * HTML, the paginator is not involved. The in-page section nav is generated
 * from the rendered headings, so nav and content cannot drift; on a narrow
 * screen everything reads in one column with the nav stacked on top.
 */
export function DocsPage() {
  const [content, setContent] = useState<DocsContent | null>(null);

  useEffect(() => {
    let live = true;
    void loadDocsContent().then((docs) => {
      if (live) setContent(docs);
    });
    return () => {
      live = false;
    };
  }, []);

  // Deep links (the Stylesheet tab's footer link lands on /docs#styling-
  // reference) scroll once the content has rendered — and move focus to the
  // section, so a keyboard or screen-reader user lands there too; scrolling
  // alone leaves tab order at the top of the page.
  useEffect(() => {
    if (!content) return;
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const target = document.getElementById(hash);
    if (!target) return;
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    target.scrollIntoView();
  }, [content]);

  return (
    <div className="flex min-h-full flex-col bg-canvas text-ink">
      <PageHeader />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Docs</h1>
        <p className="mt-2 max-w-prose text-sm text-ink-soft">
          Everything PerfectMarkD can do, and how to use it. Markdown in,
          print-perfect PDF out — in the browser, with no account and nothing to
          install.
        </p>

        <div className="mt-6 lg:flex lg:gap-10">
          <nav aria-label="Sections" className="shrink-0 lg:w-56">
            <ul className="list-none space-y-0.5 lg:sticky lg:top-6">
              {(content?.sections ?? []).map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className={navLink}>
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <article
            className="docs-prose min-w-0 flex-1"
            data-testid="docs-prose"
            dangerouslySetInnerHTML={{ __html: content?.html ?? '' }}
          />
        </div>
      </main>

      <Footer />
    </div>
  );
}
