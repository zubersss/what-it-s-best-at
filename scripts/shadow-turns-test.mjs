// The shadow tiles drawn in turns (shadows/nearShadow.js): a tile that is not drawn this
// frame must still put its shadows in the right place after the camera has moved. Headless:
//   node scripts/shadow-turns-test.mjs [--dist] [--out dir]
// At the Moon's lander: the wide and fine tiles are held as drawn, the camera is moved 4 m
// sideways and 1.5 m up, and the picture is taken; then every tile is drawn afresh from the
// new place and the picture is taken again. The two must agree (the shadows are the darkest
// thing in the view: a tile left behind would move them by metres).
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { open, opt, flag, root } from './lib/browser.mjs';
import { readPng } from './lib/png.mjs';

const out = path.resolve(root, opt('out', '.cache/shadowturns'));
await mkdir(out, { recursive: true });
const { base, page, errors, snap, goto, close } = await open({ dist: flag("dist") || !!opt("distdir", null), width: 660, height: 309, dsf: 1 });
await goto(`${base}?world=moon&shot=ship`);
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 600000, polling: 250 });
const frames = (n) => page.evaluate((k) => new Promise((res) => { const a = window.__app, f0 = a.frameCount; const t = setInterval(() => { if (a.frameCount >= f0 + k) { clearInterval(t); res(); } }, 50); }), n);
const where = () => page.evaluate(() => { const p = window.__app.rig.pos; return [p.x, p.y, p.z]; });
const p0 = await where();
// hold the two scene tiles, walk the camera 4 m to the side, let three frames pass
await page.evaluate(() => { const a = window.__app, s = a.nearShadow, r = a.rig; s.hold = true; r.pos.addScaledVector(r.right, 4); });
await frames(3);
const p1 = await where(), moved = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
const held = await page.evaluate(() => window.__app.nearShadow.drawn);
await snap(path.join(out, 'held.png'));
// the check must be able to fail: the tiles put 5 m from where they were drawn
await page.evaluate(() => { for (const st of window.__app.nearShadow.state) st.ax += 5; });
await frames(2);
await snap(path.join(out, 'wrong.png'));
// every tile afresh from here
await page.evaluate(() => { const s = window.__app.nearShadow; s.hold = false; s._has = false; });
await frames(3);
await snap(path.join(out, 'fresh.png'));
const a = readPng(path.join(out, 'held.png')), b = readPng(path.join(out, 'fresh.png')), c = readPng(path.join(out, 'wrong.png'));
const differ = (x, y) => { let n = 0; for (let i = 0; i < x.data.length; i += 3) if (Math.abs(x.data[i] - y.data[i]) + Math.abs(x.data[i + 1] - y.data[i + 1]) + Math.abs(x.data[i + 2] - y.data[i + 2]) > 24) n++; return n / (x.data.length / 3); };
const good = differ(a, b), bad = differ(c, b);
console.log(`the camera moved ${moved.toFixed(2)} m; texels drawn into the atlas while held: ${held}`);
console.log(`pixels that differ from tiles drawn afresh: held ${(100 * good).toFixed(3)} % · held and put 5 m wrong ${(100 * bad).toFixed(3)} % (this one must differ)`);
const ok = moved > 3 && held === 0 && good < 0.002 && bad > 4 * good + 0.002 && !errors.length;
console.log(ok ? 'shadow turns test passed' : 'PROBLEM: tiles held while the camera moves do not agree with fresh ones (or the test saw nothing)');
await close();
process.exit(ok ? 0 : 1);
