// The page's own work for the sky, method by method, in the real game at a view (headless):
//   node scripts/sky-work.mjs --distdir <frozen build> [--query "alt=4500&t=4"] [--frames 40] [--size 440x206]
// Every method of the sky system and of its parts is timed (inclusive of what it calls) over
// --frames frames at rest and printed as ms a frame, with how often it ran. Software WebGL
// makes every call into the GPU slow here, so a method that draws reads far too high: the
// table is for the methods that only compute (lists, samples of the field, uniforms). Their
// times are this machine's; the order and the ratios carry to a phone.
import { open, opt } from './lib/browser.mjs';
const [W, H] = opt('size', '440x206').split('x').map(Number);
const { base, page, goto, close } = await open({ dist: true, width: W, height: H, dsf: 1 });
await goto(`${base}?world=haven&shot=${opt('shot', 'ledge')}&${opt('query', '')}`);
const t0 = Date.now();
while (Date.now() - t0 < 900000) { await page.waitForTimeout(3000); if (await page.evaluate(() => window.__shotReady === true || !!window.__shotError)) break; }
const frames = +opt('frames', 40);
await page.evaluate(() => {
  const sky = window.__app.sky, T = (window.__skyWork = { rows: new Map(), f0: window.__app.frameCount });
  const wrap = (obj, name) => {
    if (!obj || typeof obj !== 'object') return;
    const seen = new Set();
    for (let p = obj; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) for (const k of Object.getOwnPropertyNames(p)) {
      if (k === 'constructor' || seen.has(k)) continue; seen.add(k);
      const d = Object.getOwnPropertyDescriptor(p, k);
      if (!d || typeof d.value !== 'function') continue;
      const fn = d.value, row = { ms: 0, n: 0 }; T.rows.set(`${name}.${k}`, row);
      obj[k] = function (...a) { const t = performance.now(); try { return fn.apply(this, a); } finally { row.ms += performance.now() - t; row.n++; } };
    }
  };
  wrap(sky, 'sky');
  for (const k of ['clouds', 'cloudVolume', 'treeShade', 'probe', 'upper', 'fog', 'lenses', 'field', 'weather', 'rain', 'steer']) wrap(sky[k], `sky.${k}`);
  if (sky.field?.producer) wrap(sky.field.producer, 'sky.field.producer');
});
const f0 = await page.evaluate(() => window.__skyWork.f0);
const t1 = Date.now();
while (Date.now() - t1 < 1200000) { await page.waitForTimeout(2000); if (await page.evaluate((f) => window.__app.frameCount >= f, f0 + frames)) break; }
const res = await page.evaluate(() => { const T = window.__skyWork, n = window.__app.frameCount - T.f0; return { n, rows: [...T.rows].map(([k, r]) => [k, r.ms / n, r.n / n]).filter((r) => r[2] > 0).sort((a, b) => b[1] - a[1]) }; });
console.log(`${res.n} frames; ms a frame (inclusive) · calls a frame`);
for (const [k, ms, n] of res.rows.slice(0, +opt('top', 45))) console.log(`  ${ms.toFixed(3).padStart(8)}  ${n.toFixed(2).padStart(6)}  ${k}`);
await close();
if (!res.n) process.exit(1);
