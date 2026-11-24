// Every kind of flower side by side, in the real game: ?debug=flowers gives each kind its
// own slice of the compass round the place, thick, and this turns round on the spot taking
// a picture every 50 degrees (look at a thing alone before looking at it in the scene).
//   node scripts/flower-preview.mjs [--out dir] [--distdir build] [--query "lat=..&lon=.."] [--fov 30] [--pitch -14] [--size 1320x618]
// The kinds in a picture, left to right, are printed with its name.
import { open, opt } from './lib/browser.mjs';
import { KINDS } from '../src/life/grassRules.js';
import { mkdir } from 'node:fs/promises';
const out = opt('out', 'flower-preview'), fov = +opt('fov', 30), pitch = +opt('pitch', -14);
const query = opt('query', 'lat=-54.4271&lon=39.2697&t=5');
const [W, H] = opt('size', '1320x618').split('x').map(Number);
await mkdir(out, { recursive: true });
const { base, page, snap, goto, close, errors } = await open({ dist: true, width: W, height: H, dsf: 1 });
let failed = false;
try {
  await goto(`${base}?world=haven&shot=ledge&${query}&heading=0&pitch=${pitch}&fov=${fov}&debug=flowers`);
  await page.waitForFunction(() => window.__shotReady === true || window.__shotError, null, { timeout: 1700000, polling: 500 });
  const n = KINDS.length - 1, hf = 2 * Math.atan(Math.tan(fov * Math.PI / 360) * W / H) * 180 / Math.PI, step = Math.min(50, hf * 0.85);
  for (let h = 0; h < 360; h += step) {
    const g = await page.evaluate((h) => { const a = window.__app; a.rig.heading = h; a.rig._prevHeading = h; return a.frameCount + 8; }, h);
    await page.waitForFunction((g) => window.__app.frameCount >= g, g, { timeout: 900000, polling: 200 });
    const file = `${out}/flowers_${String(Math.round(h)).padStart(3, '0')}.png`;
    if (!(await snap(file))) failed = true;
    const names = []; for (let b = h - hf / 2; b < h + hf / 2; b += 360 / n) names.push(KINDS[1 + (((Math.floor(((b + 360) % 360) / 360 * n)) % n) + n) % n].name);
    console.log(`${file}: ${names.join(', ')}`);
  }
  if (errors.length) { console.log('PAGE ERRORS: ' + errors.slice(0, 3).join(' | ')); failed = true; }
} catch (e) { console.log('FAILED: ' + String(e).split('\n')[0]); failed = true; }
await close();
process.exit(failed ? 1 : 0);
