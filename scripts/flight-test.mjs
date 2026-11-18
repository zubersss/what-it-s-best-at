// Scripted flight test (headless): start on Mars behind the flying character, climb out,
// aim at the Moon, fly there and check that the engine hands over to the Moon world.
//   node scripts/flight-test.mjs [output dir for screenshots, default .cache/flight]
// Headless frames are slow, so the script acts on distances, not on timers.
import { createRequire } from 'node:module';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), out = process.argv[2] || path.join(root, '.cache', 'flight');
mkdirSync(out, { recursive: true });
const server = await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 720, height: 340 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e).slice(0, 400)));
await page.goto(server.resolvedUrls.local[0] + '?hud=0&scale=0.6', { waitUntil: 'load' });
await page.waitForFunction(() => window.__app && window.__app.loaded, null, { timeout: 120000 });
const state = () => page.evaluate(() => { const a = window.__app; return { world: a.world.id, agl: a.rig.agl, speed: a.rig.velocity.length(), nearest: a.nearestName, clear: a.nearestClear, drawn: a.terrain.drawList.length, frame: a.frameCount }; });
const fmt = (s) => `${s.world} agl ${s.agl.toExponential(2)} m, speed ${s.speed.toExponential(2)} m/s, nearest ${s.nearest} ${s.clear.toExponential(2)} m, chunks ${s.drawn}, frame ${s.frame}`;
const snap = async (name) => { try { await page.screenshot({ path: `${out}/${name}.png`, timeout: 120000 }); } catch { console.log('snap failed', name); } console.log(name, '::', fmt(await state())); };
const until = async (cond, maxSeconds, every, tick) => {
  const t0 = Date.now(); let n = 0;
  while (Date.now() - t0 < maxSeconds * 1000) { const s = await state(); if (cond(s)) return true; if (tick) await tick(s, n++); await page.waitForTimeout(every); }
  return false;
};

await page.click('#start button.primary');            // Play
await page.waitForTimeout(8000);
await snap('00_start');
await page.keyboard.down('KeyE');
let ok = await until((s) => s.agl > 2e4, 200, 1500);
await snap('01_20km');
ok = await until((s) => s.agl > 1.2e6, 200, 1500);
await page.keyboard.up('KeyE');
await page.waitForTimeout(6000);
await snap('02_orbit');
await page.evaluate(() => window.__app.aimAt('moon'));
await page.waitForTimeout(2500);
await snap('03_aim_moon');
await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft');
let shots = 0;
ok = await until((s) => s.world === 'moon' && s.agl < 4e6, 600, 1200, async (s, n) => {
  await page.evaluate(() => window.__app.aimAt('moon'));            // keep the nose on it
  if (n % 25 === 12 && shots < 6) await snap(`04_cruise_${shots++}`);
});
console.log('reached the Moon world:', ok);
await page.keyboard.up('ShiftLeft');
await until((s) => s.world === 'moon' && s.agl < 6e4, 300, 1200, async () => { await page.evaluate(() => { window.__app.rig.pitch = -85; }); });     // nose down: descend
await page.keyboard.up('KeyW');
await snap('05_low_orbit');
await page.waitForTimeout(25000);
await snap('06_settled');
console.log('errors:', errors.length ? errors.slice(0, 6).join('\n  ') : 'none');
await browser.close(); await server.close();
