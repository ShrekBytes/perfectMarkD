import { PricingPage } from './pricing/PricingPage';
import { useRoute } from './router';
import { AppShell } from './shell/AppShell';

/**
 * Route switch for the SPA's two surfaces (PLAN.md §3): the `/` editor and the
 * static `/pricing` page. Unknown paths fall back to the editor for now; the
 * hidden `/export` route the server loads arrives with the server's export
 * pipeline (ADR-0003).
 */
export function App() {
  const route = useRoute();
  return route === 'pricing' ? <PricingPage /> : <AppShell />;
}
