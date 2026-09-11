import { AdminPage } from './admin/AdminPage';
import { AuthPage } from './auth/AuthPage';
import { PricingPage } from './pricing/PricingPage';
import { useRoute } from './router';
import { AppShell } from './shell/AppShell';

/**
 * Route switch for the SPA's surfaces (PLAN.md §3): the `/` editor, the
 * static `/pricing` page, the two auth forms (`/login`, `/register`) the
 * upgrade flow uses, and the Admin's panel (`/admin`, billing/02). Unknown
 * paths fall back to the editor for now; the hidden `/export` route the
 * server loads arrives with the server's export pipeline (ADR-0003).
 */
export function App() {
  const route = useRoute();
  switch (route) {
    case 'pricing':
      return <PricingPage />;
    case 'login':
      return <AuthPage mode="login" />;
    case 'register':
      return <AuthPage mode="register" />;
    case 'admin':
      return <AdminPage />;
    default:
      return <AppShell />;
  }
}
