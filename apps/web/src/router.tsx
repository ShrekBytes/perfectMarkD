import { useEffect, useState, type AnchorHTMLAttributes } from 'react';

/**
 * Minimal History-API routing for the SPA's few surfaces (PLAN.md §3: `/`
 * editor, `/pricing`, the static About and Privacy pages, and the admin
 * panel). No router dependency — the surfaces are few and static. Same-tab
 * pushes fire a custom event because popstate only covers browser navigation;
 * deep links work wherever the host serves index.html as the SPA fallback
 * (Vite dev does by default; the server's static serving config handles it in
 * server/06). Unknown paths get the 404 page (launch-chrome spec).
 */

export type Route =
  | 'editor'
  | 'pricing'
  | 'login'
  | 'register'
  | 'admin'
  | 'export'
  | 'about'
  | 'privacy'
  | 'not-found';

const NAVIGATE_EVENT = 'perfectmarkd:navigate';

export function routeForPath(pathname: string): Route {
  // The editor is the homepage (ADR-0007) — matched explicitly, since every
  // other unknown path now gets the 404.
  if (pathname === '/') return 'editor';
  if (pathname === '/pricing') return 'pricing';
  if (pathname === '/login') return 'login';
  if (pathname === '/register') return 'register';
  if (pathname === '/admin') return 'admin';
  if (pathname === '/about') return 'about';
  if (pathname === '/privacy') return 'privacy';
  // Hidden render surface the server's worker loads (server/03, ADR-0003).
  if (pathname === '/export') return 'export';
  // Unknown paths get the 404 instead of falling through to a fresh editor
  // (launch-chrome spec): a fresh editor reads as broken rather than
  // intentional.
  return 'not-found';
}

/** Pushes a new history entry and notifies useRoute() subscribers in this tab. */
export function navigate(path: string): void {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    routeForPath(window.location.pathname),
  );

  useEffect(() => {
    const sync = () => setRoute(routeForPath(window.location.pathname));
    window.addEventListener('popstate', sync);
    window.addEventListener(NAVIGATE_EVENT, sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener(NAVIGATE_EVENT, sync);
    };
  }, []);

  return route;
}

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
}

/** Internal link that swaps views through the History API instead of reloading. */
export function Link({ to, onClick, ...rest }: LinkProps) {
  return (
    <a
      href={to}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        // Modified clicks mean "open in a new tab" — let the browser have it.
        if (
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        ) {
          return;
        }
        event.preventDefault();
        navigate(to);
      }}
      {...rest}
    />
  );
}
