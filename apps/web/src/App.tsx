import { AdminPage } from './admin/AdminPage';
import { AuthPage } from './auth/AuthPage';
import { ExportPage } from './export/ExportPage';
import { AboutPage } from './pages/AboutPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { PricingPage } from './pricing/PricingPage';
import { useRoute } from './router';
import { AppShell } from './shell/AppShell';

/**
 * Route switch for the SPA's surfaces (PLAN.md §3): the `/` editor, the
 * static `/pricing`, About, and Privacy pages, the two auth forms
 * (`/login`, `/register`) the upgrade flow uses, the Admin's panel (`/admin`,
 * billing/02), and the hidden `/export` render surface the server's worker
 * loads (server/03, ADR-0003). Unknown paths get the 404 (launch-chrome
 * spec) instead of falling through to the editor.
 */
export function App() {
  const route = useRoute();
  switch (route) {
    case 'pricing':
      return <PricingPage />;
    case 'about':
      return <AboutPage />;
    case 'privacy':
      return <PrivacyPage />;
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
