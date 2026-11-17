// Shared by the headless scripts: serves the game (dev server, or dist/ with `dist`) and
// opens it in headless Chromium with software WebGL. Frame rates here mean nothing.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, preview } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const args = process.argv.slice(2);
export const opt = (name, def) => (args.includes('--' + name) ? args[args.indexOf('--' + name) + 1] : def);
export const flag = (name) => args.includes('--' + name);

export async function open({ dist = false, width = 880, height = 412, dsf = 1.25, touch = false } = {}) {
  const server = dist
    ? await preview({ root, logLevel: 'error', preview: { port: 4179, strictPort: false, host: '127.0.0.1' } })
    : await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
  if (!dist) await server.listen();
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-vsync'],
  });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dsf, hasTouch: touch, isMobile: touch });
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { problems.push(m.text().slice(0, 400)); console.log(`[browser ${m.type()}]`, m.text().slice(0, 600)); } });
  page.on('pageerror', (e) => { problems.push(String(e).slice(0, 400)); console.log('[pageerror]', String(e).slice(0, 600)); });
  // Software WebGL frames can take a long time; never let one slow screenshot kill a run.
  const snap = async (file) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await page.screenshot({ path: file, timeout: 180000 }); return true; } catch (e) { console.log(`  screenshot attempt ${attempt + 1} failed (${String(e).split('\n')[0]})`); }
    }
    return false;
  };
  const close = async () => { await browser.close(); await (dist ? server.httpServer.close() : server.close()); };
  return { base: server.resolvedUrls.local[0], browser, page, problems, snap, close };
}
