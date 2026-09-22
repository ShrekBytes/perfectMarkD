// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The page's content module renders the real markdown through the engine —
// covered in docs-content.test.tsx. Here the page wiring runs on a fixture.
vi.mock('../docs/docs-content', () => ({
  loadDocsContent: () =>
    Promise.resolve({
      html: '<h2 id="one">One</h2><p>First section.</p><h2 id="two">Two</h2>',
      sections: [
        { id: 'one', title: 'One' },
        { id: 'two', title: 'Two' },
      ],
    }),
}));

import { DocsPage } from './DocsPage';
import { stubSystemTheme } from '../testing/match-media';

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  stubSystemTheme('light');
  window.history.pushState({}, '', '/docs');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DocsPage', () => {
  it('renders the title, the generated section nav, and the rendered content', async () => {
    render(<DocsPage />);

    expect(
      screen.getByRole('heading', { name: 'Docs', level: 1 }),
    ).toBeInTheDocument();

    // The nav is generated from the rendered headings — same ids, same order.
    const nav = await screen.findByRole('navigation', { name: 'Sections' });
    const links = Array.from(nav.querySelectorAll('a'));
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '#one',
      '#two',
    ]);
    expect(links.map((link) => link.textContent)).toEqual(['One', 'Two']);

    // The article carries the rendered markdown's own headings.
    const article = screen.getByTestId('docs-prose');
    expect(article).toContainElement(screen.getByText('First section.'));
  });

  it('scrolls the deep-linked section into view and focuses it', async () => {
    window.history.pushState({}, '', '/docs#two');
    render(<DocsPage />);

    // jsdom implements no scrolling; the stub records what was asked.
    const scrolled: string[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      scrolled.push(this.id);
    });

    await waitFor(() => expect(scrolled).toEqual(['two']));
    // Focus follows the scroll: a keyboard or screen-reader user lands in the
    // section (tab order continues from it) instead of staying at the top.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Two' })).toHaveFocus(),
    );

    Element.prototype.scrollIntoView = original;
  });

  it('scrolls nowhere without a hash', async () => {
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;

    render(<DocsPage />);
    await waitFor(() =>
      expect(screen.getByTestId('docs-prose')).not.toBeEmptyDOMElement(),
    );
    expect(scrollIntoView).not.toHaveBeenCalled();

    Element.prototype.scrollIntoView = original;
  });
});
