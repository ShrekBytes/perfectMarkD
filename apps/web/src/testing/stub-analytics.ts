import { vi } from 'vitest';

// Replaces the analytics wrapper in component tests. Suites assert that the
// app *asked* for an event; whether that call reaches umami is the wrapper's
// own business (analytics/tracker.test.ts, against a fake window.umami).
//
// Consume it the way App.test.tsx consumes stub-mermaid — the factory has to
// be async because vi.mock is hoisted above the imports:
//
//   vi.mock('../analytics/tracker', async () => {
//     const { stubAnalyticsModule } = await import('../testing/stub-analytics');
//     return stubAnalyticsModule;
//   });
export const stubAnalyticsModule = {
  initAnalytics: vi.fn(),
  trackPageView: vi.fn(),
  trackEvent: vi.fn(),
};
