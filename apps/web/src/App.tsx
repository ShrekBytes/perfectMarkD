import { useEffect } from 'react';
import { AdminPage } from './admin/AdminPage';
import { AccountPage } from './account/AccountPage';
import { AuthPage } from './auth/AuthPage';
import { ExportPage } from './export/ExportPage';
import { AboutPage } from './pages/AboutPage';
import { DocsPage } from './pages/DocsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { PricingPage } from './pricing/PricingPage';
import { useRoute } from './router';
import { AppShell } from './shell/AppShell';
import { initAnalytics, trackPageView } from './analytics/tracker';

/**
 * Route switch for the SPA's surfaces (PLAN.md §3): the `/` editor, the
 * static `/pricing`, About, Privacy, and Docs pages, the Account page
 * (`/account`), the two auth forms (`/login`, `/register`) the upgrade flow
 * uses, the Admin's panel (`/admin`, billing/02), and the hidden `/export`
 * render surface the server's worker loads (server/03, ADR-0003). Unknown
 * paths get the 404 (launch-chrome spec) instead of falling through to the
 * editor.
 *
 * Analytics (launch/01) hooks in here because this is the one place that sees
 * every route change. The hidden `/export` surface is left out entirely: the
 * export worker loads it once per Server Export, so tracking it would count
 * machine renders as visitors.
 */
export function App() {
  const route = useRoute();

  useEffect(() => {
    if (route === 'export') return;
    initAnalytics();
    trackPageView(window.location.pathname);
  }, [route]);

  switch (route) {
    case 'pricing':
      return <PricingPage />;
    case 'account':
      return <AccountPage />;
    case 'about':
      return <AboutPage />;
    case 'privacy':
      return <PrivacyPage />;
    case 'docs':
      return <DocsPage />;
    case 'login':
      return <AuthPage mode="login" />;
    case 'register':
      return <AuthPage mode="register" />;
    case 'admin':
      return <AdminPage />;
    case 'export':
      return <ExportPage />;
    case 'not-found':
      return <NotFoundPage />;
    default:
      return <AppShell />;
  }
}
