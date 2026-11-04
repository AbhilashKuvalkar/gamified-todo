import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The app is hosted in the IIS application /UBMV, so every asset URL and
// API call is prefixed with it. Override with VITE_BASE_PATH if needed.
const BASE = (process.env.VITE_BASE_PATH || '/UBMV').replace(/\/+$/, '') + '/';

export default defineConfig({
  base: BASE,
  plugins: [react()],
  // Output goes to client/dist. Its contents (including public/web.config) are the
  // complete IIS application folder for /UBMV.
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // In dev (and `npm run preview`), forward /UBMV/api/* to the Node API on :3001
    proxy: {
      [`${BASE}api`]: { target: 'http://127.0.0.1:3001', changeOrigin: true },
    },
  },
});
