// The grass handed over block by block against the grass handed over whole, in the real game,
// in one browser session, at the same moment (headless; a ground-level view takes half an hour
// to settle on a software renderer, one from the air a few minutes):
//   node scripts/grass-cull-pair.mjs --distdir <frozen build> [--world haven] [--shot ledge] [--query "alt=1560&pitch=-28"]
//        [--out dir] [--suffix _x] [--timeout 1500] [--set "<js in which `off` is true for the old way>" --names new,old]
// (--set: another switch than the grass's, tried the same way, e.g. the far forest's light at
// its corners against at every pixel: --set "__app.farForest.shared.uShadow.value.z = off ? 1 : 0"
// --names corners,pixels --limit 0.5; then the pictures may differ a little, and --limit says by how
// many percent of the pixels by more than 2 levels)
// Two builds' pictures of one view cannot be compared to the pixel: the grass's wave is added
// up frame by frame, and two runs are never ready on the same frame. Here the picture is held
// still (the wave's phase put back before every frame, pollen and falling leaves out, the
// clock stopped), and three pictures are taken a few frames apart: blocks, whole, blocks again.
// Prints how many pixels differ between the two pictures by blocks (what a few frames change
// by themselves: the exposure settling) and between blocks and whole, and the triangles handed
// over each way. Fails (exit 1) if blocks against whole differ in more pixels by more than 2
// levels than blocks against blocks do (plus a twentieth of a percent), if the page reports an
// error, or if the blocks hand over as many triangles as the whole.
import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { open, opt } from './lib/browser.mjs';

const world = opt('world', 'haven'), shot = opt('shot', 'ledge'), query = opt('query', ''), out = opt('out', '.'), suffix = opt('suffix', ''), timeoutS = +opt('timeout', 1500);
const setJs = opt('set', ''), names = opt('names', 'blocks,whole').split(','), limit = +opt('limit', 0.05) / 100;
const [W, H] = opt('size', '880x412').split('x').map(Number);
const { base, page, errors, snap, goto, close } = await open({ dist: true, width: W, height: H, dsf: +opt('dsf', 1.25) });
await goto(`${base}?world=${world}&shot=${shot}${query ? '&' + query : ''}`);
try { await page.waitForFunction(() => window.__shotReady === true || window.__shotError, null, { timeout: timeoutS * 1000, polling: 500 }); }
catch { console.log(`  not ready after ${timeoutS} s: going on with what is on screen`); }
// the picture held still
await page.evaluate(() => {
  const a = window.__app, g = a.grass, P0 = g.phase, up = g.update.bind(g);
  g.update = (rig, dt, r) => { g.phase = P0; return up(rig, 0.1, r); };
  a.pollen.mesh.removeFromParent(); if (a.leaves) a.leaves.enabled = false; if (a.petals) a.petals.enabled = false;
  a.paused = true;
});
const take = async (name, off) => {
  const tris = await page.evaluate(async ({ off, setJs }) => {
    const a = window.__app; if (setJs) new Function('off', '__app', setJs)(off, a); else a.grass.cullOff = off;
    const f0 = a.frameCount; await new Promise((res) => { const w = () => (a.frameCount >= f0 + 3 ? res() : setTimeout(w, 200)); w(); });
    return { grass: a.grass.triangles, all: a.stats.triangles };
  }, { off, setJs });
  const file = path.join(out, `${setJs ? 'pair' : 'grass_cull'}_${name}${suffix}.png`);
  await snap(file);
  console.log(`  ${name}: ${tris.grass} triangles of grass handed over, ${tris.all} in the frame · ${file}`);
  return { file, ...tris };
};
fs.mkdirSync(out, { recursive: true });
const A = await take(names[0], false), B = await take(names[1], true), C = await take(`${names[0]}_again`, false);
await close();

// --- the pictures against each other (PNG, 8 bits, no interlace: what the browser writes)
function pixels(file) {
  const b = fs.readFileSync(file); let o = 8, w = 0, h = 0, type = 0; const idat = [];
  while (o < b.length) { const len = b.readUInt32BE(o), t = b.toString('latin1', o + 4, o + 8); if (t === 'IHDR') { w = b.readUInt32BE(o + 8); h = b.readUInt32BE(o + 12); type = b[o + 17]; } else if (t === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + len)); o += 12 + len; }
  const n = type === 6 ? 4 : type === 2 ? 3 : 0; if (!n) throw new Error(`${file}: a PNG of colour type ${type}`);
  const raw = zlib.inflateSync(Buffer.concat(idat)), px = new Uint8Array(w * h * 3), line = new Uint8Array(w * n), prev = new Uint8Array(w * n);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (w * n + 1)], row = raw.subarray(y * (w * n + 1) + 1, (y + 1) * (w * n + 1));
    for (let i = 0; i < w * n; i++) {
      const a = i >= n ? line[i - n] : 0, up = prev[i], ul = i >= n ? prev[i - n] : 0;
      let v = row[i];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1; else if (f === 4) { const p = a + up - ul, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - ul); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : ul; }
      line[i] = v & 255;
    }
    for (let x = 0; x < w; x++) { px[(y * w + x) * 3] = line[x * n]; px[(y * w + x) * 3 + 1] = line[x * n + 1]; px[(y * w + x) * 3 + 2] = line[x * n + 2]; }
    prev.set(line);
  }
  return { w, h, px };
}
function differ(a, b) {
  let any = 0, two = 0, eight = 0, most = 0;
  for (let i = 0; i < a.px.length; i += 3) { const d = Math.max(Math.abs(a.px[i] - b.px[i]), Math.abs(a.px[i + 1] - b.px[i + 1]), Math.abs(a.px[i + 2] - b.px[i + 2])); if (d > 0) any++; if (d > 2) two++; if (d > 8) eight++; if (d > most) most = d; }
  const n = a.px.length / 3, pc = (x) => (100 * x / n).toFixed(3) + ' %';
  return { text: `pixels that differ at all ${pc(any)}, by more than 2 levels ${pc(two)}, by more than 8 ${pc(eight)}, the most ${most}`, two: two / n };
}
const pa = pixels(A.file), pb = pixels(B.file), pcx = pixels(C.file);
const self = differ(pa, pcx), cut = differ(pa, pb);
console.log(`${names[0]} against ${names[0]}, a few frames on (what the picture changes by itself): ${self.text}`);
console.log(`${names[0]} against ${names[1]}: ${cut.text}`);
let failed = false;
if (cut.two > self.two + limit) { console.log(`FAILED: the picture by ${names[0]} is not the picture by ${names[1]}`); failed = true; }
if (!setJs && !(A.grass < B.grass)) { console.log(`FAILED: the blocks hand over ${A.grass} triangles of grass, the whole field ${B.grass}`); failed = true; }
if (errors.length) { console.log(`FAILED: page errors — ${errors.slice(0, 3).join(' | ')}`); failed = true; }
console.log(failed ? 'pair: FAILED' : setJs ? `pair: the same picture by ${names[0]} and by ${names[1]}` : `grass cull pair: the same picture from ${(100 * A.grass / B.grass).toFixed(0)} % of the grass's triangles (${A.grass} of ${B.grass})`);
process.exit(failed ? 1 : 0);
