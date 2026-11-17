// Headless screenshots of the camera bookmarks. See CLAUDE.md.
//   node scripts/shots.mjs [--world mars] [--shot ledge,sun] [--size 1280x720] [--out docs/shots] [--dist]
//                          [--query "t=0.5&hud=1"] [--suffix _x] [--timeout 240] [--dsf 2] [--touch]
// Phone-shaped example (S23 Ultra landscape is about 880x412 CSS px): --size 880x412 --dsf 2 --touch
// Headless Chromium uses software WebGL: frame rates here mean nothing.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, preview } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const opt = (name, def) => (args.includes('--' + name) ? args[args.indexOf('--' + name) + 1] : def);
const world = opt('world', 'mars');
const shots = opt('shot', 'ledge,sun,wall,ship,dusk').split(',');
const [W, H] = opt('size', '1280x720').split('x').map(Number);
const outDir = path.resolve(root, opt('out', 'docs/shots'));
const extraQuery = opt('query', '');
const suffix = opt('suffix', '');
const timeoutS = Number(opt('timeout', '300'));
const dsf = Number(opt('dsf', '1'));                 // device scale factor (a phone is ~2.6–3.5)
const touch = args.includes('--touch');             // emulate a touch device

await mkdir(outDir, { recursive: true });
// --dist serves the production build (run `npm run build` first) instead of the dev server.
const useDist = args.includes('--dist');
const server = useDist
  ? await preview({ root, logLevel: 'error', preview: { port: 4179, strictPort: false, host: '127.0.0.1' } })
  : await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
if (!useDist) await server.listen();
const base = server.resolvedUrls.local[0];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-vsync'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: dsf, hasTouch: touch, isMobile: touch });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[browser ${m.type()}]`, m.text().slice(0, 600)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 600)));

const summary = {};
let failed = false;
for (const shot of shots) {
  const url = `${base}?world=${world}&shot=${shot}${extraQuery ? '&' + extraQuery : ''}`;
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  try {
    await page.waitForFunction(() => window.__shotReady === true || window.__shotError, null, { timeout: timeoutS * 1000, polling: 250 });
  } catch {
    console.log(`  ${shot}: not ready after ${timeoutS}s — saving what is on screen`);
    failed = true;
  }
  const err = await page.evaluate(() => window.__shotError || null);
  if (err) { console.log(`  ${shot}: ERROR ${err}`); failed = true; }
  const stats = await page.evaluate(() => window.__stats || null);
  const file = path.join(outDir, `${world}_${shot}${suffix}.png`);
  // Software WebGL frames can take a long time; never let one slow screenshot kill the run.
  let saved = false;
  for (let attempt = 0; attempt < 3 && !saved; attempt++) {
    try { await page.screenshot({ path: file, timeout: 180000 }); saved = true; }
    catch (e) { console.log(`  ${shot}: screenshot attempt ${attempt + 1} failed (${String(e).split('\n')[0]})`); }
  }
  if (!saved) failed = true;
  summary[shot] = stats;
  console.log(`${world}/${shot}: ${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify(stats));
}
await writeFile(path.join(outDir, `${world}_stats${suffix}.json`), JSON.stringify(summary, null, 2));
await browser.close();
await (useDist ? server.httpServer.close() : server.close());
process.exit(failed ? 1 : 0);
