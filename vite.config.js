import { defineConfig } from 'vite';

// Relative base so the build can be hosted from any sub-path (GitHub Pages).
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  worker: { format: 'es' },
  server: { host: '127.0.0.1' },
});
