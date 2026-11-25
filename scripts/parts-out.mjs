// Who draws that? One view of the real game, taken again and again with one part out of
// it each time, and for each part how much of the picture (or of a box in it) changed.
// For the thing in a picture nobody can name: a dark patch, a sprinkle of specks, a line.
// One browser session: the scene settles once, each part costs a few frames.
//
//   node scripts/parts-out.mjs --world haven --shot ledge [--query "alt=60&pitch=-20"]
//        [--box 0.2,0.6,0.8,1] [--only casters.trees,trees] [--out dir] [--distdir build] [--timeout 1700]
//
// --box x0,y0,x1,y1: the part of the picture to judge, as shares of its width and height
// (0,0 top left). Pictures are saved as <out>/<part>.png, the whole one as none.png.
// The parts are found in the running game (a part it does not have is left out):
//   grass.blades.N  grass.clumps.N  trees  farForest  rocks  farRocks  leaves
//   casters.trees  casters.rocks  casters.other   (what draws into the near shadow maps)
// A part is taken out of its scene, never hidden: the app shows a hidden part again on
// the next frame. The exposure is held at the whole picture's, so taking a dark thing out
// does not brighten everything else; and the pictures are compared in blocks of 6 x 6
// pixels (their means), because the grass moves in the wind between one picture and the
// next. The whole picture is taken again at the end ("none again"): what that row shows
// is the noise the other rows are to be read against.
import { open, opt } from './lib/browser.mjs';
import { decodePNG } from './lib/png.mjs';
import { mkdir, readFile } from 'node:fs/promises';

const world = opt('world', 'haven'), shot = opt('shot', 'ledge'), query = opt('query', '');
const out = opt('out', 'parts-out'), timeout = +opt('timeout', 1700) * 1000;
const only = opt('only', null)?.split(',') ?? null;
const box = (opt('box', '0,0,1,1')).split(',').map(Number);
const [W, H] = opt('size', '660x309').split('x').map(Number);
await mkdir(out, { recursive: true });

const { base, page, snap, goto, close, errors } = await open({ dist: true, width: W, height: H, dsf: 1 });
let failed = false;
try {
  await goto(`${base}?world=${world}&shot=${shot}${query ? '&' + query : ''}`);
  await page.waitForFunction(() => window.__shotReady === true || window.__shotError, null, { timeout, polling: 500 });
  const frames = async (n) => {
    const g = await page.evaluate((n) => window.__app.frameCount + n, n);
    await page.waitForFunction((g) => window.__app.frameCount >= g, g, { timeout: 900000, polling: 200 });
  };
  // the parts this game has, by name; each a way to take it out that hands back the way to put it back
  const names = await page.evaluate(() => {
    const a = window.__app, P = (window.__parts = {});
    const takeAll = (ms) => () => { const ps = ms.map((m) => m.parent); ms.forEach((m) => m.parent && m.parent.remove(m)); return () => ms.forEach((m, i) => ps[i] && ps[i].add(m)); };
    const g = a.grass;
    (g?.fields ?? []).forEach((f, i) => { if (f.mesh) P['grass.blades.' + i] = takeAll([f.mesh]); });
    (g?.clumps ?? []).forEach((f, i) => { if (f.mesh) P['grass.clumps.' + i] = takeAll([f.mesh]); });
    if (a.trees?.meshes?.length) P.trees = takeAll(a.trees.meshes.slice());
    if (a.farForest?.mesh) P.farForest = takeAll([a.farForest.mesh]);
    if (a.rocks?.mesh) P.rocks = takeAll([a.rocks.mesh]);
    if (a.farRocks?.group) P.farRocks = takeAll([a.farRocks.group]);
    if (a.leaves?.mesh) P.leaves = takeAll([a.leaves.mesh]);
    const ns = a.nearShadow;
    if (ns?.casters) {
      // (a build before trees.casters: one caster a set, set.cast)
      const treeCast = new Set((a.trees?.casters?.map((c) => c.mesh) ?? (a.trees?.sets ?? []).flat(3).map((s) => s?.cast)).filter(Boolean));
      const kind = (c) => (treeCast.has(c.mesh) ? 'trees' : c.mesh === a.rocks?.mesh ? 'rocks' : 'other');
      for (const k of ['trees', 'rocks', 'other']) {
        if (!ns.casters.some((c) => kind(c) === k)) continue;
        P['casters.' + k] = () => { const keep = ns.casters; ns.casters = keep.filter((c) => kind(c) !== k); return () => { ns.casters = keep; }; };
      }
    }
    return Object.keys(P);
  });
  const parts = ['none', ...names.filter((n) => !only || only.includes(n)), 'none again'];
  console.log(`parts: ${names.join(' ')}`);
  const pic = async (name) => { const f = `${out}/${name.replace(/ /g, '_')}.png`; if (!(await snap(f))) throw new Error('no picture of ' + name); return decodePNG(await readFile(f)); };
  // the means of blocks of B x B pixels inside the box: [luminance, ...]
  const B = 6;
  const blocks = (im) => {
    const x0 = Math.floor(box[0] * im.width), x1 = Math.ceil(box[2] * im.width), y0 = Math.floor(box[1] * im.height), y1 = Math.ceil(box[3] * im.height), o = [];
    for (let y = y0; y + B <= y1; y += B) for (let x = x0; x + B <= x1; x += B) {
      let r = 0, g = 0, b = 0;
      for (let v = 0; v < B; v++) for (let u = 0; u < B; u++) { const i = ((y + v) * im.width + x + u) * 3; r += im.rgb[i]; g += im.rgb[i + 1]; b += im.rgb[i + 2]; }
      o.push(r / (B * B), g / (B * B), b / (B * B));
    }
    return o;
  };
  let ref = null;
  console.log('part                blocks changed   mean brighter by   (in the box; a block: 6 x 6 pixels, changed: by more than 10 of 255)');
  for (const p of parts) {
    const real = p !== 'none' && p !== 'none again';
    if (real) await page.evaluate((p) => { window.__back = window.__parts[p](); }, p);
    await frames(8);
    const bl = blocks(await pic(p));
    if (p === 'none') {
      ref = bl;
      // (the exposure held from here on: screenshot mode sets it afresh from every frame's metering)
      await page.evaluate(() => { const po = window.__app.post, st = po.settings; st.min = st.max = po.exposure; });
    } else {
      let ch = 0, lum = 0;
      for (let i = 0; i < bl.length; i += 3) {
        const d = Math.max(Math.abs(bl[i] - ref[i]), Math.abs(bl[i + 1] - ref[i + 1]), Math.abs(bl[i + 2] - ref[i + 2]));
        if (d > 10) ch++; lum += (bl[i] + bl[i + 1] + bl[i + 2] - ref[i] - ref[i + 1] - ref[i + 2]) / 3;
      }
      const n = bl.length / 3;
      console.log(`${p.padEnd(18)} ${(100 * ch / n).toFixed(1).padStart(8)} %      ${(lum / n).toFixed(1).padStart(7)}`);
      if (real) await page.evaluate(() => { window.__back(); window.__back = null; });
    }
  }
  if (errors.length) { console.log('errors in the page:', errors.slice(0, 3)); failed = true; }
} catch (e) { console.log('FAILED:', String(e).split('\n')[0]); failed = true; }
await close();
process.exit(failed ? 1 : 0);
