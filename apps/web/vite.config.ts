import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev proxy: the SPA and the API are separate processes in development
// (`pnpm --filter @perfectmarkd/server dev` on PORT, default 3000). In
// production Caddy serves both from one origin (server/06).
// /auth/google is the Google Sign-In flow (google-signin/01) — the button is a
// plain link to the start, and the callback comes back to the API, so both
// legs go to the same host as /api. Caddy proxies the same paths in production.
const API_ORIGIN = process.env.VITE_API_ORIGIN ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    proxy: {
      '/api': API_ORIGIN,
      '/auth/google': API_ORIGIN,
    },
  },
});
