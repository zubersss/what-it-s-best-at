import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

// The commit the page was built from, shown on the start screen and the HUD.
function commit() {
  if (process.env.BUILD_COMMIT) return process.env.BUILD_COMMIT.slice(0, 7);
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'dev'; }
}

// Relative base so the build can be hosted from any sub-path (GitHub Pages).
export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify({ commit: commit(), time: new Date().toISOString().slice(0, 16) + 'Z' }) },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  worker: { format: 'es' },
  server: { host: '127.0.0.1' },
});
