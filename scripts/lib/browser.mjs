// Shared by the headless scripts: serves the game (dev server, or dist/ with `dist`, or a
// frozen copy of a build with --distdir <path>) and opens it in headless Chromium with
// software WebGL. Frame rates here mean nothing.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, preview } from 'vite';
import fs from 'node:fs';
import { execFile } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const EXT_CACHE = process.env.EXT_CACHE || '/root/mapcache/ext';
export const args = process.argv.slice(2);
export const opt = (name, def) => (args.includes('--' + name) ? args[args.indexOf('--' + name) + 1] : def);
export const flag = (name) => args.includes('--' + name);

export async function open({ dist = false, width = 880, height = 412, dsf = 1.25, touch = false } = {}) {
  // --distdir <path>: serve that copy of a build instead of dist/ (a frozen build, so a
  // rebuild while a long batch of pictures runs cannot change them halfway).
  // It implies `dist`: without that the live dev server would serve src/ and the frozen copy
  // would be ignored without a word.
  const distDir = opt('distdir', null);
  if (distDir) { dist = true; console.log(`serving the frozen build in ${path.resolve(distDir)}`); }
  const server = dist
    ? await preview({ root, logLevel: 'error', preview: { port: 4179, strictPort: false, host: '127.0.0.1' }, ...(distDir ? { build: { outDir: path.resolve(distDir) } } : {}) })
    : await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
  // The map services the game streams from (terrain/tiles) cannot be reached by the test
  // browser: they are mirrored here from a cache on disk, filled with curl on a miss.
  // The page is told through window.__EXT (see below).
  // (first in line: the servers' own fall-backs would answer before it)
  const extMirror = (req, res) => {
    const rel = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, '');
    if (!/^[a-z0-9.-]+\/[A-Za-z0-9._\/-]+$/.test(rel) || rel.includes('..')) { res.statusCode = 400; res.end(); return; }
    const file = path.join(EXT_CACHE, rel), miss = file + '.404';
    const send = () => { res.setHeader('Content-Type', /\.png$/.test(file) ? 'image/png' : 'image/jpeg'); res.setHeader('Cache-Control', 'max-age=86400'); res.end(fs.readFileSync(file)); };
    if (fs.existsSync(file)) return send();
    if (fs.existsSync(miss)) { res.statusCode = 404; res.end(); return; }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    execFile('curl', ['-sS', '-m', '60', '--retry', '2', '-o', file + '.part', '-w', '%{http_code}', 'https://' + rel], (err, out) => {
      const code = String(out || '').trim();
      if (!err && code === '200') { fs.renameSync(file + '.part', file); return send(); }
      fs.rmSync(file + '.part', { force: true });
      if (code === '404') fs.writeFileSync(miss, '');
      res.statusCode = code === '404' ? 404 : 502; res.end();
    });
  };
  server.middlewares.stack.unshift({ route: '/__ext', handle: extMirror });
  if (!dist) await server.listen();
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-vsync'],
  });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dsf, hasTouch: touch, isMobile: touch });
  await page.addInitScript(() => { window.__EXT = '/__ext'; });
  // problems: every console error and warning and every uncaught page error.
  // errors: the same without the warnings (what a run of pictures must not have).
  const problems = [], errors = [];
  // The software GL driver's performance notes ("GPU stall due to ReadPixels") are not faults.
  const benign = (t) => /GL Driver Message \(OpenGL, Performance/.test(t);
  page.on('console', (m) => {
    if ((m.type() !== 'error' && m.type() !== 'warning') || benign(m.text())) return;
    problems.push(m.text().slice(0, 400)); if (m.type() === 'error') errors.push(m.text().slice(0, 400));
    console.log(`[browser ${m.type()}]`, m.text().slice(0, 600));
  });
  page.on('pageerror', (e) => { problems.push(String(e).slice(0, 400)); errors.push('uncaught: ' + String(e).slice(0, 400)); console.log('[pageerror]', String(e).slice(0, 600)); });
  // Software WebGL frames can take a long time; never let one slow screenshot kill a run.
  const snap = async (file) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await page.screenshot({ path: file, timeout: 180000 }); return true; } catch (e) { console.log(`  screenshot attempt ${attempt + 1} failed (${String(e).split('\n')[0]})`); }
    }
    return false;
  };
  // Under software WebGL the previous page can keep the browser busy for a long time:
  // navigation gets a generous timeout and a second try.
  const goto = async (url) => {
    for (let attempt = 0; ; attempt++) {
      try { await page.goto(url, { waitUntil: 'load', timeout: 240000 }); return; }
      catch (e) { if (attempt >= 2) throw e; console.log(`  navigation attempt ${attempt + 1} failed, trying again`); }
    }
  };
  const close = async () => { await browser.close(); await (dist ? server.httpServer.close() : server.close()); };
  return { base: server.resolvedUrls.local[0], browser, page, problems, errors, snap, goto, close };
}
